// Мінімальний SCO для SCORM 1.2: LMSInitialize -> score.raw + lesson_status -> LMSCommit -> LMSFinish.
(function () {
  'use strict';

  var MAX_PARENT_DEPTH = 10;
  var SPIKE_SCORE = '80';

  function findApi(win) {
    var depth = 0;
    var current = win;
    while (current && depth <= MAX_PARENT_DEPTH) {
      if (current.API) {
        return current.API;
      }
      if (current.parent === current) {
        break;
      }
      current = current.parent;
      depth += 1;
    }
    if (win.opener) {
      return findApi(win.opener);
    }
    return null;
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = text;
    }
  }

  window.addEventListener('load', function () {
    var api = findApi(window);
    if (!api) {
      setText('api-status', 'SCORM API не знайдено');
      return;
    }
    var initialized = String(api.LMSInitialize('')) === 'true';
    setText('api-status', initialized ? 'LMSInitialize: true' : 'LMSInitialize: false, код ' + api.LMSGetLastError());

    document.getElementById('submit-score').addEventListener('click', function () {
      var ok = [
        api.LMSSetValue('cmi.core.score.min', '0'),
        api.LMSSetValue('cmi.core.score.max', '100'),
        api.LMSSetValue('cmi.core.score.raw', SPIKE_SCORE),
        api.LMSSetValue('cmi.core.lesson_status', 'passed'),
        api.LMSCommit('')
      ].every(function (r) { return String(r) === 'true'; });
      var finished = String(api.LMSFinish('')) === 'true';
      setText('result', ok && finished ? 'Результат збережено: ' + SPIKE_SCORE : 'Помилка SCORM API, код ' + api.LMSGetLastError());
    });
  });
})();
