/*
 * Copyright 2011 - 2019 Axel von Bertoldi
 * Copyright 2019 by pcm720 (GNOME 3.32/ES6-compatible classes)
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program; if not, write to:
 * The Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor
 * Boston, MA 02110-1301, USA.
 */

const St = imports.gi.St;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const ModalDialog = imports.ui.modalDialog;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;

const Gettext = imports.gettext.domain("gnome-shell-trash-extension");
const _ = Gettext.gettext;

const TrashMenuItem = GObject.registerClass(
  class TrashMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(text, icon_name, gicon, callback) {
      super._init(0.0, text);

      let icon_cfg = { style_class: 'popup-menu-icon' };
      if (icon_name != null) {
        icon_cfg.icon_name = icon_name;
      } else if (gicon != null) {
        icon_cfg.gicon = gicon;
      }

      this.icon = new St.Icon(icon_cfg);
      this.actor.add_child(this.icon);
      this.label = new St.Label({ text: text });
      this.actor.add_child(this.label);

      this.connect('activate', callback);
    }

    destroy() {
      super.destroy();
    }
  });

const TrashMenu = GObject.registerClass(
  class TrashMenu extends PanelMenu.Button {
    _init() {
      super._init(0.0, _("Trash"));
      this.trashIcon = new St.Icon({
        icon_name: 'user-trash-full-symbolic',
        style_class: 'popup-menu-icon'
      })
      this.actor.add_actor(this.trashIcon);

      // If this fails, see workaround in https://bugs.archlinux.org/task/62860
      this.trash_path = 'trash:///';
      this.trash_file = Gio.file_new_for_uri(this.trash_path);

      this._addConstMenuItems();
      this._onTrashChange();
      this._setupWatch();
    }

    _addConstMenuItems() {
      this.empty_item = new TrashMenuItem(_("Empty Trash"),
        "edit-delete-symbolic",
        null,
        this._onEmptyTrash.bind(this));
      this.menu.addMenuItem(this.empty_item);

      this.open_item = new TrashMenuItem(_("Open Trash"),
        "folder-open-symbolic",
        null,
        this._onOpenTrash.bind(this));
      this.menu.addMenuItem(this.open_item);

      this.separator = new PopupMenu.PopupSeparatorMenuItem();
      this.menu.addMenuItem(this.separator);

      this.filesList = new PopupMenu.PopupMenuSection();
      this.menu.addMenuItem(this.filesList);
    }

    destroy() {
      super.destroy();
    }

    _onOpenTrash() {
      Gio.app_info_launch_default_for_uri(this.trash_path, null);
    }

    _setupWatch() {
      this.monitor = this.trash_file.monitor_directory(0, null);
      this.monitor.connect('changed', this._onTrashChange.bind(this));
    }

    _onTrashChange() {
      this._clearMenu();
      if (this._listFilesInTrash() == 0) {
        this.actor.visible = false;
      } else {
        this.actor.show();
        this.actor.visible = true;
      }
    }

    _onEmptyTrash() {
      new ConfirmEmptyTrashDialog(this._doEmptyTrash.bind(this)).open();
    }

    _doEmptyTrash() {
      let children = this.trash_file.enumerate_children('*', 0, null);
      let child_info = null;
      while ((child_info = children.next_file(null)) != null) {
        let child = this.trash_file.get_child(child_info.get_name());
        child.delete(null);
      }
    }

    _listFilesInTrash() {
      let children = this.trash_file.enumerate_children('*', 0, null);
      let count = 0;
      let file_info = null;
      while ((file_info = children.next_file(null)) != null) {
        let file_name = file_info.get_name();
        let item = new TrashMenuItem(file_info.get_display_name(),
          null,
          file_info.get_symbolic_icon(),
          () => {
            this._openTrashItem(file_name);
          });
        this.filesList.addMenuItem(item);
        count++;
      }
      children.close(null)
      return count;
    }

    _clearMenu() {
      this.filesList.removeAll();
    }

    _openTrashItem(file_name) {
      let file = this.trash_file.get_child(file_name);
      Gio.app_info_launch_default_for_uri(file.get_uri(), null);
      this.menu.close();
    }
  });

const MESSAGE = _("Are you sure you want to delete all items from the trash?\n\
This operation cannot be undone.");

var ConfirmEmptyTrashDialog = GObject.registerClass(
  class extends ModalDialog.ModalDialog {
    _init(emptyMethod) {
      super._init({ styleClass: null });

      let mainContentBox = new St.BoxLayout({
        style_class: `polkit-dialog-main-layout`,
        vertical: false
      });
      this.contentLayout.add_child(mainContentBox, { x_fill: true, y_fill: true });

      let messageBox = new St.BoxLayout({
        style_class: `polkit-dialog-message-layout`,
        vertical: true
      });
      mainContentBox.add_child(messageBox, { y_align: St.Align.START });

      this._subjectLabel = new St.Label({
        style_class: `polkit-dialog-headline`,
        style: `text-align: center; font-size: 1.6em; padding-bottom:1em`,
        text: _("Empty Trash?")
      });

      messageBox.add_child(this._subjectLabel, { y_fill: false, y_align: St.Align.START });

      this._descriptionLabel = new St.Label({
        style_class: `polkit-dialog-description`,
        style: `text-align: center`,
        text: Gettext.gettext(MESSAGE)
      });

      messageBox.add_child(this._descriptionLabel, { y_fill: true, y_align: St.Align.START });

      this.setButtons([
        {
          label: _("Cancel"),
          action: () => {
            this.close();
          },
          key: Clutter.Escape
        },
        {
          label: _("Empty"),
          action: () => {
            this.close();
            emptyMethod();
          }
        }
      ]);
    }
  });

function init(extensionMeta) {
  imports.gettext.bindtextdomain("gnome-shell-trash-extension", extensionMeta.path + "/locale");
}

let _indicator;

function enable() {
  _indicator = new TrashMenu;
  Main.panel.addToStatusArea('trash_button', _indicator);
}

function disable() {
  _indicator.destroy();
}
