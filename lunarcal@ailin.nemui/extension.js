
const { Clutter, Gio, GLib, GObject, Gdk, LunarDate, Shell, GnomeDesktop, St } = imports.gi;
const Main = imports.ui.main;
const Calendar = imports.ui.calendar;
const MessageList = imports.ui.messageList;

const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Gettext_lunarDate = imports.gettext.domain('lunar-date');
const _ld = Gettext_lunarDate.gettext;
const diZhi = "Zǐ, Chǒu, Yín, Mǎo, Chén, Sì, Wǔ, Wèi, Shēn, Yǒu, Xū, Hài"
      .split(", ").map(function(_){ return _ld(_); });
const jieri_str = LunarDate.DATE_MAJOR_VERSION >= 3 || LunarDate.DATE_MAJOR_VERSION == 2 && LunarDate.DATE_MINOR_VERSION >= 9 ? "%(holiday)" : "%(jieri)";

let replacementFunc = [], ld = new LunarDate.Date, settingsChanged = [], localSettings = {};
let settings;

ld.setDate = function (date) {
  this.set_solar_date(date.getFullYear(), (1+date.getMonth()), date.getDate(), date.getHours());
};

ld.setDateNoon = function (date) {
  this.set_solar_date(date.getFullYear(), (1+date.getMonth()), date.getDate(), 12);
};

ld.getShi = function () {
  return diZhi[~~((+this.strftime("%(hour)")+1)/2)%12];
};

function init() {
}

function _make_new_with_args (my_class, args) {
  return new (Function.prototype.bind.apply(my_class,
					    [null].concat(Array.prototype.slice.call(args))))();
}

function _getLunarClockDisplay() {
  let show_date = settings.get_boolean('show-date');
  return ((show_date ? "\u2001" + ld.strftime("%(YUE)月%(RI)日") : "") +
	  (settings.get_boolean('show-time') ? ld.getShi() + (show_date ? "时" : "") : ""));
};

// avoid replacing WallClock with a custom Object inheriting from
// GObject due to bgo#734071

var LunarCalendarMessage = GObject.registerClass(
class LunarCalendarMessage extends MessageList.Message {

  canClear() { return false; }

  canClose() { return false; }

  _sync() {
    super._sync();
    this._closeButton.visible = this.canClear();
  }
});

var LunarCalendarSection = GObject.registerClass(
class LunarCalendarSection extends MessageList.MessageListSection {

  _init() {
    super._init('Lunar Calendar');

    this._title = new St.Button({ style_class: 'events-section-title',
                                  label: '',
                                  x_align: Clutter.ActorAlign.START,
                                  can_focus: true });
    this.insert_child_below(this._title, null);
  }

  get allowed() {
    return Main.sessionMode.showCalendarEvents;
  }

  _reloadEvents() {
    this._reloading = true;

    this._list.destroy_all_children();

    let jr = settings.get_boolean('jieri') ? ld.strftime(jieri_str) : "";
    if (jr != "")
      this.addMessage(new LunarCalendarMessage("节日", ld.get_jieri("\n")), false);

    if (settings.get_boolean('ba-zi'))
      this.addMessage(new LunarCalendarMessage("八字", ld.strftime("%(Y8)年%(M8)月%(D8)日")), false);

    if (settings.get_boolean('gen-zhi'))
      this.addMessage(new LunarCalendarMessage("干支", ld.strftime("%(Y60)年%(M60)月%(D60)日")), false);

    this._reloading = false;
    this._sync();
  }

  setDate(date) {
    super.setDate(date);
    ld.setDateNoon(date);
    let cny = ld.strftime("%(shengxiao)");
    this._title.label = ld.strftime("%(NIAN)年%(YUE)月%(RI)日");
    this._reloadEvents();
  }

  _shouldShow() { return true; }

  _sync() {
    if (this._reloading)
      return;

    super._sync();
  }
});

function enable() {
  settings = Convenience.getSettings();
  settings.connect('changed', function() {
    for (x in settingsChanged) {
      settingsChanged[x]();
    }
  });

  let dm = Main.panel.statusArea.dateMenu;

  let cal = dm._calendar;
  let ml = dm._messageList;
  let cny_now;

  replacementFunc.calendarUpdater = cal._update;
  replacementFunc.originalMonthHeader = cal._headerFormat;
  // gnome 3.12
  replacementFunc.calendarRebuilder = cal._rebuildCalendar;

  let fixupHeader = _("%A %B %e, %Y").match(/%Y[^%]+%/);
  if (fixupHeader)
    cal._headerFormat = cal._headerFormat.replace(/%Y.%/, fixupHeader);

  let _toHex = function (number) {
    let t = (number * 65535).toString(16);
    while (t.length < 4) t = '0' + t;
    return t;
  };

  settingsChanged.updateLocal = function () {
    let color = new Gdk.RGBA;
    color.parse('white');
    color.parse(settings.get_string('jieri-color'));
    localSettings.jieri_color = "#" + _toHex(color.red) + _toHex(color.green) + _toHex(color.blue);
  };
  settingsChanged.updateLocal();

  let updateDate = function () {
    ld.setDate(new Date());
    cny_now = ld.strftime("%(shengxiao)");
    // gnome 3.16
    ml._lunarCalendarSection.cny_now = cny_now;
    let date_label = dm._date._dateLabel;
    date_label.text = date_label.text + (date_label.text.match(/[.,]/) ? ", " : "\u2001") + cny_now;
  };

  dm._clock.run_dispose();

  // gnome 3.14.1
  replacementFunc.openMenuId = dm.menu.connect('open-state-changed', function(menu, isOpen) {
    if (isOpen)
      updateDate();
  });

  dm._clock = new GnomeDesktop.WallClock();
  let _clockUpdater = function () {
    ld.setDate(new Date());
    dm._clockDisplay.text = dm._clock.clock + _getLunarClockDisplay();
  };
  dm._clock.connect('notify::clock', Lang.bind(dm, _clockUpdater));
  _clockUpdater();
  settingsChanged.refreshClock = _clockUpdater;

  let lunarButton = function (orig_button, iter_date, oargs) {
    let fat_button = false;
    if (+oargs[0].label == +iter_date.getDate().toString()) {
      iter_date._lunar_iter_found = true;
      ld.setDateNoon(iter_date);
      let yd = settings.get_boolean('show-calendar') ? ld.strftime("%(ri)") : "";
      let jr = settings.get_boolean('jieri') ? ld.strftime(jieri_str) : "";
      let dx = settings.get_string('zti-dx');
      fat_button = yd != "";
      let l = oargs[0].label;
      //if (yd != "") l = "<u> " + l + " </u>"; 
      if (jr != "") l = "<span weight='bold' color='" + localSettings.jieri_color + "'>" + l + "</span>";
      if (yd != "") l += "\n<small>" + 
	ld.strftime(yd == "1" ? "%(YUE)月" : "%(RI)") +
	"</small>";
      if (dx != "none") l = "<span size='" + dx + "'>" + l + "</span>";
      oargs[0].label = l;
    }
    let new_button = _make_new_with_args(orig_button, oargs);

    return new_button;
  };

  let updateYear = function (that) {
    ld.setDateNoon(that._selectedDate);
    let cny = ld.strftime("%(shengxiao)");
    if (cny != cny_now)
      that._monthLabel.text = that._monthLabel.text + " / " + cny;

  };

  // gnome 3.12
  cal._rebuildCalendar = function () {
    let orig_button = St.Button;
    let orig_date = Date;
    let iter_date = new orig_date();

    Date = function () {
      let new_date = _make_new_with_args(orig_date, arguments);
      if (!iter_date._lunar_iter_found &&
	  arguments.length > 0 && arguments[0] instanceof orig_date) {
	iter_date = new_date;
      }
      return new_date;
    };

    St.Button = function () {
      return lunarButton(orig_button, iter_date, arguments);
    };

    replacementFunc.calendarRebuilder.apply(this, arguments);

    St.Button = orig_button;
    Date = orig_date;
    let cal_style_class = cal.style_class.split(' ')
	  .filter(function(e){ return e.length && e != 'lunar-calendar'; });
    if (settings.get_boolean('show-calendar'))
      cal_style_class.push('lunar-calendar');
    cal.style_class = cal_style_class.join(' ');
  };

  cal._update = function () {
    replacementFunc.calendarUpdater.apply(this, arguments);
    updateYear(this);
  };

  settingsChanged.rebuildCal = function () {
    cal._rebuildCalendar();
  };
  settingsChanged.rebuildCal();

  // gnome 3.16
  ml._lunarCalendarSection = new LunarCalendarSection();
  ml._addSection(ml._lunarCalendarSection);
  ml._sectionList.set_child_at_index(ml._lunarCalendarSection, 3);
  ml._lunarCalendarSection._sync();
  ml._sync();
}

function disable() {
  let dm = Main.panel.statusArea.dateMenu;

  let restore_style = dm._calendar.style_class.split(' ')
    .filter(function(e){ return e.length && e != 'lunar-calendar'; })
	.join(' ');
  dm._calendar.style_class = restore_style;

  dm._calendar._update = replacementFunc.calendarUpdater;
  dm._calendar._headerFormat = replacementFunc.originalMonthHeader;
  dm._calendar._rebuildCalendar = replacementFunc.calendarRebuilder;

  // gnome 3.36
  dm._messageList._lunarCalendarSection.run_dispose();
  delete dm._messageList._lunarCalendarSection;

  dm._clock.run_dispose();
  dm._clock = new GnomeDesktop.WallClock();

  // gnome 3.14.1
  dm.menu.disconnect(replacementFunc.openMenuId);
  dm._clock.bind_property('clock', dm._clockDisplay, 'text', GObject.BindingFlags.SYNC_CREATE);
  settingsChanged.rebuildCal();

  settingsChanged = [];
  settings.run_dispose();
  settings = null;

  delete replacementFunc.calendarUpdater;
  delete replacementFunc.originalMonthHeader;
  delete replacementFunc.calendarRebuilder;
  delete replacementFunc.openMenuId;
}
