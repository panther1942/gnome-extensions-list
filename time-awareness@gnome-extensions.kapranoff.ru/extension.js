/*
 * Copyright (c) 2020 Alex Kapranoff
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Authors: Alex Kapranoff <alex@kapranoff.ru>
 */
"use strict";

const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const GLib = imports.gi.GLib;

// reuse excellent nautilus l10n for time units
const Gettext = imports.gettext.domain("nautilus");

const IDLE_THRESHOLD = 120;
// Moment in the past when the current session of "non-idleness" started.
// Zero if the user is currently idle.
// Idleness defined as being idle for more than IDLE_THRESHOLD seconds.
var Work_Session_Start;

var Clock_Label;

function amend_clock_text(addendum) {
    const clock_text = Clock_Label.get_text();
    let new_clock_text = clock_text.replace(/ - .*$/, "");

    if (addendum !== "") {
        new_clock_text += " - " + addendum;
    }

    if (clock_text !== new_clock_text) {
        Clock_Label.set_text(new_clock_text);
    }
}

function format_with_gettext(template_single, template_plural, number) {
    const localized_template
        = Gettext.ngettext(template_single, template_plural, number);

    return localized_template.replace("%'d",
                                      new Intl.NumberFormat().format(number));
}

function format_duration(end, begin) {
    const minutes = Math.floor(end.difference(begin) / 1000 / 1000 / 60);
    if (minutes > 60) {
        const minutes_last_hour = minutes % 60;
        const hours = (minutes - minutes_last_hour) / 60;
        if (minutes_last_hour > 0) {
            return format_with_gettext("%'d hour", "%'d hours", hours)
                + " "
                + format_with_gettext("%'d minute", "%'d minutes", minutes_last_hour);
        }
        return format_with_gettext("%'d hour", "%'d hours", hours);
    } else if (minutes > 0) {
        return format_with_gettext("%'d minute", "%'d minutes", minutes);
    }
    return "";
}

var _Idle_Monitor;

function draw_clock() {
    const is_idle = _Idle_Monitor.get_idletime() / 1000 > IDLE_THRESHOLD;
    const was_idle = Work_Session_Start === 0;
    const now = GLib.DateTime.new_now_local();

    /*
    is was
    ------
    0  0 -> nop;
    0  1 -> session start = cur_time();
    1  0 -> session_start = 0;
    1  1 -> nop;
    */

    if (!is_idle && was_idle) {
        // start new work session
        Work_Session_Start = now;
    } else if (is_idle && !was_idle) {
        // work session just ended
        Work_Session_Start = 0;
    }

    if (Work_Session_Start === 0) {
        amend_clock_text("");
    } else {
        amend_clock_text(format_duration(now, Work_Session_Start));
    }
}

var _Signal_Handler;

function enable() {
    if (!_Idle_Monitor) {
        _Idle_Monitor = Meta.IdleMonitor.get_core();
    }

    if (!Clock_Label) {
        let status_area = Main.panel._statusArea;
        if (!status_area) {
            status_area = Main.panel.statusArea;
        }

        if (!status_area || !status_area.dateMenu
            || !status_area.dateMenu.actor)
        {
            print("Cannot find dateMenu, aborting");
            return;
        }

        // retrieve the first child with get_text() method, should be
        // the datetime label
        for (let child of
             status_area.dateMenu.actor.first_child.get_children())
        {
            if (child.get_text) {
                Clock_Label = child;
                break;
            }
        }

        if (!Clock_Label) {
            print("Cannot find clock label, aborting");
            return;
        }

        // idle after boot
        Work_Session_Start = 0;

        _Signal_Handler = Clock_Label.connect("notify::text", draw_clock);
        draw_clock();
    }
}

function disable() {
    if (Clock_Label) {
        if (_Signal_Handler) {
            Clock_Label.disconnect(_Signal_Handler);
            _Signal_Handler = void 0;
        }
        amend_clock_text("");
        Clock_Label = void 0;
    }
    if (_Idle_Monitor) {
        _Idle_Monitor = void 0;
    }
}
