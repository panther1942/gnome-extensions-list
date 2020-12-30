
const Gio = imports.gi.Gio;
const ExtensionUtils = imports.misc.extensionUtils;

function getSettings() {
  let extension = ExtensionUtils.getCurrentExtension();
  return new Gio.Settings({
	settings_schema: Gio.SettingsSchemaSource.new_from_directory(
	 extension.dir.get_child('schemas').get_path(),
	 Gio.SettingsSchemaSource.get_default(),
	 false)
	.lookup(extension.metadata['settings-schema'], false)
  });
}
