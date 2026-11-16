use semver::Version;
use tauri_plugin_updater::{RemoteRelease, UpdaterExt};

/// Should the remote release be offered to the build that's running?
///
/// This replaces the plugin's plain `release.version > current.version`.
///
/// Semver ranks a pre-release BELOW its own final -- `0.2.11-1` is older than
/// `0.2.11` -- which would make the pre-release channel invisible to exactly
/// the people it exists for: a player sitting on stable `0.2.11` would never
/// be offered `0.2.11-1`, because the updater would decide it isn't newer and
/// silently return "nothing to update".
///
/// A pre-release of `0.2.11` carries content that hasn't shipped yet, so for
/// someone on stable `0.2.11` it IS the newer build. We flip that single case
/// and keep normal semver for everything else.
///
/// `js/channel.js::tdvNewer` mirrors this rule exactly, so the web build and
/// the desktop build reach the same verdict.
fn should_update(current: Version, remote: RemoteRelease) -> bool {
    is_newer(current, remote.version)
}

/// Is `remote` something `current` should be offered?
///
/// Split out from [`should_update`] purely so it can be tested without having
/// to fabricate a whole manifest.
fn is_newer(current: Version, remote: Version) -> bool {
    let base_remote = (remote.major, remote.minor, remote.patch);
    let base_current = (current.major, current.minor, current.patch);

    // A different base always decides on its own terms:
    //   0.2.12 > 0.2.11   but   0.2.11-9 < 0.2.12
    if base_remote != base_current {
        return base_remote > base_current;
    }

    // Same base. `is_empty()` == no pre-release suffix.
    match (remote.pre.is_empty(), current.pre.is_empty()) {
        // 0.2.11-1 offered to 0.2.11 -> newer (the whole point of the channel)
        (false, true) => true,
        // 0.2.11 offered to 0.2.11-1 -> never an upgrade, it has less content
        (true, false) => false,
        // both pre-releases, or both final: normal semver decides.
        // Equal versions (both branches empty) fall through to `false`.
        _ => remote.pre > current.pre,
    }
}

/// The handful of manifest fields the boot screen needs to draw its prompt.
#[derive(serde::Serialize)]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
    pub_date: Option<String>,
}

/// Build an updater pointed at one specific manifest URL.
///
/// The stock JS `updater.check()` can only ever look at the endpoint baked
/// into tauri.conf.json, so a developer or tester could never move between
/// the stable and pre-release channels at runtime. Signature key and version
/// still come from the plugin config as usual.
///
/// `force` bypasses [`should_update`] and reports whatever the channel
/// publishes, letting JavaScript decide — that's how it notices it is sitting
/// on a version that has since been pulled.
fn updater_for(
    app: &tauri::AppHandle,
    endpoint: &str,
    force: bool,
) -> Result<tauri_plugin_updater::Updater, String> {
    let url = url::Url::parse(endpoint).map_err(|e| e.to_string())?;
    let builder = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?;

    let builder = if force {
        builder.version_comparator(|_, _| true)
    } else {
        builder.version_comparator(should_update)
    };

    builder.build().map_err(|e| e.to_string())
}

/// Returns the manifest exactly as the channel publishes it — even when it is
/// OLDER than the running build, which is precisely the case JavaScript needs
/// in order to offer a switch back to the latest stable.
#[tauri::command]
async fn tdv_check_update(
    app: tauri::AppHandle,
    endpoint: String,
) -> Result<Option<UpdateInfo>, String> {
    let updater = updater_for(&app, &endpoint, true)?;
    match updater.check().await {
        Ok(Some(u)) => Ok(Some(UpdateInfo {
            version: u.version,
            notes: u.body,
            pub_date: u.date.map(|d| d.to_string()),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Download + install from an arbitrary channel endpoint, streaming progress
/// to the boot screen as `tdv-update-progress` events.
///
/// `force` installs whatever the manifest says regardless of version order —
/// used when the player has agreed to step back off a pulled build.
#[tauri::command]
async fn tdv_install_update(
    app: tauri::AppHandle,
    endpoint: String,
    force: Option<bool>,
) -> Result<(), String> {
    use tauri::Emitter;

    let updater = updater_for(&app, &endpoint, force.unwrap_or(false))?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no update available".to_string())?;

    let mut done: usize = 0;
    let on_chunk = app.clone();
    let on_finish = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                done += chunk;
                let _ = on_chunk.emit(
                    "tdv-update-progress",
                    serde_json::json!({ "event": "progress", "done": done, "total": total }),
                );
            },
            move || {
                let _ = on_finish.emit(
                    "tdv-update-progress",
                    serde_json::json!({ "event": "installing" }),
                );
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    // Windows exits the process inside install(), so this only runs elsewhere.
    let _ = app.emit(
        "tdv-update-progress",
        serde_json::json!({ "event": "done" }),
    );
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // covers every updater made through UpdaterExt, including the JS
        // `updater.check()` fallback in js/update.js
        .plugin(
            tauri_plugin_updater::Builder::new()
                .default_version_comparator(should_update)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![tdv_check_update, tdv_install_update])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::is_newer;

    fn newer(a: &str, b: &str) -> bool {
        is_newer(
            semver::Version::parse(b).unwrap(),
            semver::Version::parse(a).unwrap(),
        )
    }

    /// `(manifest, installed, expected, why)`
    const CASES: &[(&str, &str, bool, &str)] = &[
        // the whole point of the custom rule: plain semver would say false here
        ("0.2.11-1", "0.2.11", true, "stable player IS offered the pre-release"),
        ("0.2.11", "0.2.11-1", false, "pre-release tester is not sent back to 0.2.11"),
        ("0.2.11-2", "0.2.11-1", true, "newer pre-release"),
        ("0.2.11-1", "0.2.11-2", false, "older pre-release"),
        // ordinary release flow
        ("0.2.12", "0.2.11", true, "normal stable update"),
        ("0.2.11", "0.2.12", false, "no silent downgrade"),
        ("0.2.12-1", "0.2.11-9", true, "pre-release across a base bump"),
        ("0.3.0", "0.2.12", true, "minor bump"),
        // equality
        ("0.2.11", "0.2.11", false, "same stable version"),
        ("0.2.11-3", "0.2.11-3", false, "same pre-release version"),
    ];

    #[test]
    fn matches_the_web_comparator() {
        for (manifest, installed, expected, why) in CASES {
            assert_eq!(
                newer(manifest, installed),
                *expected,
                "manifest {manifest} vs installed {installed}: {why}"
            );
        }
    }

    /// The downgrade prompt keys off the reverse of this same question, so the
    /// relation has to be antisymmetric or both prompts could fire at once.
    #[test]
    fn is_antisymmetric() {
        let pairs = [
            ("0.2.11", "0.2.11-1"),
            ("0.2.11", "0.2.12"),
            ("0.2.11-1", "0.2.11-2"),
            ("0.2.12", "0.2.11"),
        ];
        for (a, b) in pairs {
            assert_ne!(
                newer(a, b),
                newer(b, a),
                "{a} vs {b}: exactly one direction may be newer"
            );
        }
        for v in ["0.2.11", "0.2.11-1", "0.2.12"] {
            assert!(!newer(v, v), "{v} is not newer than itself");
        }
    }
}
