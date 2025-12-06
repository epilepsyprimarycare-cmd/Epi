// date-utils.js
// Centralized date parsing and formatting helpers shared across the Epicare frontend

(function(global) {
    'use strict';

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function coerceYear(yearString) {
        var year = parseInt(yearString, 10);
        if (year < 100) {
            year += 2000;
        }
        return year;
    }

    function sanitizeDateInput(dateInput) {
        if (dateInput === null || dateInput === undefined) return null;

        if (dateInput instanceof Date) {
            return isNaN(dateInput.getTime()) ? null : new Date(dateInput.getTime());
        }

        if (typeof dateInput === 'number' && isFinite(dateInput)) {
            var numericDate = new Date(dateInput);
            return isNaN(numericDate.getTime()) ? null : numericDate;
        }

        var raw = String(dateInput).trim();
        if (!raw) return null;

        // Normalize common separator variants
        var normalized = raw.replace(/\./g, '-');

        // dd/mm/yyyy or dd-mm-yyyy
        var dmy = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
        if (dmy) {
            var day = parseInt(dmy[1], 10);
            var month = parseInt(dmy[2], 10) - 1;
            var year = coerceYear(dmy[3]);
            var constructed = new Date(year, month, day, 0, 0, 0, 0);
            return isNaN(constructed.getTime()) ? null : constructed;
        }

        // yyyy-mm-dd or yyyy/mm/dd (optionally with time)
        if (/^\d{4}[\/-]\d{2}[\/-]\d{2}/.test(normalized)) {
            var isoLike = normalized.replace(/\//g, '-');
            var isoInput = isoLike.length === 10 ? isoLike + 'T00:00:00' : isoLike;
            var isoDate = new Date(isoInput);
            return isNaN(isoDate.getTime()) ? null : isoDate;
        }

        // Native Date fallback
        var fallback = new Date(normalized);
        return isNaN(fallback.getTime()) ? null : fallback;
    }

    function parse(dateInput, options) {
        options = options || {};
        var parsed = sanitizeDateInput(dateInput);
        if (parsed && options.clampToMidnight) {
            parsed.setHours(0, 0, 0, 0);
        }
        return parsed;
    }

    function formatForInput(dateInput) {
        var d = parse(dateInput);
        if (!d) return '';
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function formatDateDDMMYYYY(dateInput) {
        var d = parse(dateInput);
        if (!d) return '';
        return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
    }

    function formatForDisplay(dateInput, options) {
        options = options || {};
        var d = parse(dateInput);
        if (!d) return options.fallback || 'N/A';

        // Allow callers to explicitly opt-in to locale aware output (e.g., for logging)
        if (options.forceLocaleFormat) {
            var locale = options.locale;
            if (!locale && global.EpicareI18n && typeof global.EpicareI18n.getCurrentLang === 'function') {
                locale = global.EpicareI18n.getCurrentLang();
            }
            if (!locale) {
                locale = 'en-GB';
            }
            var formatOptions = options.formatOptions || { day: '2-digit', month: '2-digit', year: 'numeric' };
            try {
                return d.toLocaleDateString(locale, formatOptions);
            } catch (err) {
                // fall through to DD-MM-YYYY formatting below
            }
        }

        // Default user-facing format for India: DD-MM-YYYY
        return pad2(d.getDate()) + '-' + pad2(d.getMonth() + 1) + '-' + d.getFullYear();
    }

    function formatForFilename(dateInput) {
        var d = parse(dateInput);
        if (!d) return '';
        return pad2(d.getDate()) + pad2(d.getMonth() + 1) + d.getFullYear();
    }

    var DateUtils = {
        parse: parse,
        formatForInput: formatForInput,
        formatForDisplay: formatForDisplay,
        formatDateDDMMYYYY: formatDateDDMMYYYY,
        formatForFilename: formatForFilename
    };

    function expose(name, fn) {
        global[name] = fn;
    }

    global.DateUtils = DateUtils;
    expose('parseDateFlexible', parse);
    expose('parseFlexibleDate', parse);
    expose('formatDateForInput', formatForInput);
    expose('formatDateForDisplay', formatForDisplay);
    expose('formatDateDDMMYYYY', formatDateDDMMYYYY);
    expose('formatDateForFilename', formatForFilename);
})(typeof window !== 'undefined' ? window : this);
