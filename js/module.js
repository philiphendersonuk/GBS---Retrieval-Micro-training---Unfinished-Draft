(function () {
  // Cache DOM
  var slides = Array.from(document.querySelectorAll(".slide"));
  var backBtn = document.getElementById("backBtn");
  var nextBtn = document.getElementById("nextBtn");
  var slideNum = document.getElementById("slideNum");
  var slideCount = document.getElementById("slideCount");
  var submitQuiz = document.getElementById("submitQuiz");
  var quizMsg = document.getElementById("quizMsg");
  var actMsg = document.getElementById("actMsg");

  // Counters
  if (slideCount) slideCount.textContent = String(slides.length);

  // Gate flags
  var tfPassed = false; // slide index 2
  var orderDone = false; // slide index 4
  var matchDone = false; // slide index 5

  // Drag/drop + tap-to-move state
  var dragged = null;
  var selectedTile = null;

  // Analytics variables (stored in cmi.suspend_data)
  var tfAttempts = 0;
  var orderAttempts = 0;
  var matchAttempts = 0;
  var exitVideoMaxProgress = 0; // 0–1 fraction
  var exitVideoMaxSeconds = 0;  // max seconds watched

  // -------- SCORM helpers --------

  function initSCORM() {
    try {
      LMSInitialize();
      var status = LMSGetValue("cmi.core.lesson_status") || "";
      if (!status || String(status).toLowerCase() === "not attempted") {
        LMSSetValue("cmi.core.lesson_status", "incomplete");
      }
      LMSCommit();
    } catch (e) {}
  }

  function saveAnalytics() {
    try {
      var payload = {
        tfAttempts: tfAttempts,
        orderAttempts: orderAttempts,
        matchAttempts: matchAttempts,
        exitVideoMaxProgress: exitVideoMaxProgress,
        exitVideoMaxSeconds: exitVideoMaxSeconds
      };
      LMSSetValue("cmi.suspend_data", JSON.stringify(payload));
      LMSCommit();
    } catch (e) {}
  }

  function loadAnalytics() {
    try {
      var raw = LMSGetValue("cmi.suspend_data");
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return;

      tfAttempts = Number(data.tfAttempts) || 0;
      orderAttempts = Number(data.orderAttempts) || 0;
      matchAttempts = Number(data.matchAttempts) || 0;
      exitVideoMaxProgress = Number(data.exitVideoMaxProgress) || 0;
      exitVideoMaxSeconds = Number(data.exitVideoMaxSeconds) || 0;
    } catch (e) {
      // ignore and keep defaults
    }
  }

  // Explicit finish action for last slide
  function finishCourse() {
    try {
      var status = (LMSGetValue("cmi.core.lesson_status") || "").toLowerCase();
      if (status !== "completed" && status !== "passed" && status !== "failed") {
        LMSSetValue("cmi.core.lesson_status", "completed");
      }
      LMSCommit();
      LMSFinish();
    } catch (e) {}
    // Simple UX message
    alert("Course finished. You can now close this window.");
  }

  // -------- Navigation --------

  var current = 0;

  function showSlide(i) {
    slides.forEach(function (s) {
      s.classList.remove("active");
    });
    current = Math.max(0, Math.min(i, slides.length - 1));
    slides[current].classList.add("active");

    if (slideNum) slideNum.textContent = String(current + 1);
    if (backBtn) backBtn.disabled = current === 0;

    if (nextBtn) {
      // On last slide, show "Finish", otherwise "Next"
      if (current === slides.length - 1) {
        nextBtn.textContent = "Finish";
      } else {
        nextBtn.textContent = "Next";
      }
    }

    try {
      LMSSetValue("cmi.core.lesson_location", String(current));
      LMSCommit();
    } catch (e) {}
  }

  function restoreLocation() {
    try {
      var loc = LMSGetValue("cmi.core.lesson_location");
      var idx = parseInt(loc, 10);
      if (!isNaN(idx) && idx >= 0 && idx < slides.length) return idx;
    } catch (e) {}
    return 0;
  }

  function guardNext() {
    // index 2 (T/F) must be correct
    if (current === 2 && !tfPassed) {
      if (actMsg) {
        actMsg.textContent = "Please answer correctly to continue.";
        actMsg.className = "msg warn";
      }
      return false;
    }
    // index 4 (ordering) must be correct
    if (current === 4 && !orderDone) {
      var om = document.getElementById("orderMsg");
      if (om) {
        om.textContent = "Complete the ordering task before continuing.";
        om.className = "msg warn";
      }
      return false;
    }
    // index 5 (matching) must be correct
    if (current === 5 && !matchDone) {
      var mm = document.getElementById("matchMsg");
      if (mm) {
        mm.textContent = "Complete the matching task before continuing.";
        mm.className = "msg warn";
      }
      return false;
    }
    return true;
  }

  // -------- Quiz grading --------

  function gradeQuiz() {
    var form = document.getElementById("quizForm");
    if (!form) return;
    var sets = Array.from(form.querySelectorAll("fieldset"));
    var correct = 0,
      total = sets.length;

    sets.forEach(function (fs) {
      var chosen = fs.querySelector('input[type="radio"]:checked');
      if (chosen && chosen.dataset && chosen.dataset.correct === "1") {
        correct++;
      }
    });

    var pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    var passed = pct >= 70;

    if (quizMsg) {
      quizMsg.textContent =
        "You scored " +
        pct +
        "% (" +
        correct +
        " of " +
        total +
        "). " +
        (passed ? "Status: PASSED" : "Status: FAILED");
      quizMsg.className = "msg " + (passed ? "ok" : "warn");
    }

    try {
      LMSSetValue("cmi.core.score.raw", String(pct));
      LMSSetValue("cmi.core.score.max", "100");
      LMSSetValue("cmi.core.lesson_status", passed ? "passed" : "failed");
      LMSCommit();
    } catch (e) {}
  }

  // -------- True/False gate --------

  function initTrueFalseGate() {
    var tfForm = document.getElementById("tfForm");
    if (!tfForm) return;
    tfForm.addEventListener("change", function () {
      var chosen = tfForm.querySelector('input[name="tf1"]:checked');
      if (!chosen) return;

      tfAttempts++; // count every change/attempt

      if (chosen.value === "false") {
        // correct
        tfPassed = true;
        if (actMsg) {
          actMsg.textContent = "Correct — you can continue.";
          actMsg.className = "msg ok";
        }
      } else {
        tfPassed = false;
        if (actMsg) {
          actMsg.textContent = "That is not correct. Try again.";
          actMsg.className = "msg warn";
        }
      }
      saveAnalytics();
    });
  }

  // -------- Flashcards --------

  function initFlashcards() {
    var flips = Array.from(document.querySelectorAll("[data-flip]"));
    flips.forEach(function (el) {
      el.addEventListener("click", function () {
        el.classList.toggle("show");
      });
    });
  }

  // -------- Drag & drop (desktop) --------

  function handleDragStart(e) {
    dragged = e.target;
    try {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
      }
    } catch (err) {}
  }

  function handleDragOver(e) {
    try {
      e.preventDefault();
    } catch (err) {}
    try {
      this.classList.add("over");
    } catch (err) {}
    try {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
    } catch (err) {}
  }

  function handleDragLeave(e) {
    try {
      this.classList.remove("over");
    } catch (err) {}
  }

  function handleDrop(e) {
    try {
      e.preventDefault();
    } catch (err) {}
    try {
      this.classList.remove("over");
    } catch (err) {}
    if (!dragged) return;
    try {
      this.appendChild(dragged);
    } catch (err) {}
    dragged = null;
  }

  function makeDropzone(el) {
    el.classList.add("dropzone");
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);
  }

  // -------- Tap-to-move (mobile + desktop fallback) --------

  function handleTileClick(e) {
    e.stopPropagation();
    var tile = e.currentTarget;

    if (selectedTile === tile) {
      // Deselect if tapping again
      tile.classList.remove("selected");
      selectedTile = null;
      return;
    }

    if (selectedTile) {
      selectedTile.classList.remove("selected");
    }

    selectedTile = tile;
    tile.classList.add("selected");
  }

  function handleZoneClick(e) {
    e.stopPropagation();
    if (!selectedTile) return;
    var zone = e.currentTarget;
    try {
      zone.appendChild(selectedTile);
    } catch (err) {}
    selectedTile.classList.remove("selected");
    selectedTile = null;
  }

  function initTapToMove() {
    var tiles = Array.from(document.querySelectorAll(".draggable"));
    var zones = Array.from(document.querySelectorAll(".dropzone"));

    tiles.forEach(function (t) {
      t.addEventListener("click", handleTileClick);
    });
    zones.forEach(function (z) {
      z.addEventListener("click", handleZoneClick);
    });
  }

  // -------- Ordering activity --------

  function initOrdering() {
    var bank = document.getElementById("order-bank");
    if (bank) makeDropzone(bank);

    Array.from(document.querySelectorAll("[data-slot]")).forEach(makeDropzone);

    Array.from(document.querySelectorAll("#order-bank .draggable")).forEach(
      function (el) {
        el.addEventListener("dragstart", handleDragStart);
      }
    );

    var btn = document.getElementById("checkOrder");
    if (btn) {
      btn.addEventListener("click", function () {
        orderAttempts++;

        var seq = [1, 2, 3, 4, 5, 6].map(function (n) {
          var z = document.querySelector('[data-slot="' + n + '"]');
          var child = z ? z.querySelector(".draggable") : null;
          return child ? child.textContent.trim() : "";
        });

        var correct = [
          "Description",
          "Feelings",
          "Evaluation",
          "Analysis",
          "Conclusion",
          "Action Plan"
        ];
        var ok = JSON.stringify(seq) === JSON.stringify(correct);
        var m = document.getElementById("orderMsg");
        if (m) {
          m.textContent = ok
            ? "Correct order — well done!"
            : "Not quite. You can tap or drag tiles between slots or back to the bank and try again.";
          m.className = "msg " + (ok ? "ok" : "warn");
        }
        orderDone = ok;
        saveAnalytics();
      });
    }

    // Shuffle bank tiles for variety
    try {
      var tiles = Array.from(
        document.querySelectorAll("#order-bank .draggable")
      );
      for (var i = tiles.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        bank.appendChild(tiles[j]);
        tiles = Array.from(
          document.querySelectorAll("#order-bank .draggable")
        );
      }
    } catch (e) {}
  }

  // -------- Matching activity --------

  function initMatching() {
    Array.from(
      document.querySelectorAll('section[data-slide="5"] .dropzone')
    ).forEach(makeDropzone);

    Array.from(document.querySelectorAll("#match-bank .draggable")).forEach(
      function (el) {
        el.addEventListener("dragstart", handleDragStart);
      }
    );

    // Randomise order of definition pairs
    try {
      var pairs = Array.from(
        document.querySelectorAll('section[data-slide="5"] .pair')
      );
      if (pairs.length) {
        var wrap = pairs[0].parentElement;
        var shuffled = pairs.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = shuffled[i];
          shuffled[i] = shuffled[j];
          shuffled[j] = tmp;
        }
        shuffled.forEach(function (p) {
          wrap.appendChild(p);
        });
      }
    } catch (e) {}

    var btn = document.getElementById("checkMatch");
    if (btn) {
      btn.addEventListener("click", function () {
        matchAttempts++;

        var zones = Array.from(document.querySelectorAll("[data-accept]"));
        var total = zones.length,
          correctCount = 0;

        zones.forEach(function (z) {
          var accept = z.getAttribute("data-accept");
          var child = z.querySelector("[data-key]");
          if (child && child.getAttribute("data-key") === accept) {
            correctCount++;
          }
        });

        var pct = Math.round((correctCount / total) * 100);
        var m = document.getElementById("matchMsg");
        if (m) {
          m.textContent =
            "You matched " +
            correctCount +
            " of " +
            total +
            " (" +
            pct +
            "%).";
          m.className = "msg " + (correctCount === total ? "ok" : "warn");
        }
        matchDone = correctCount === total;
        saveAnalytics();
      });
    }
  }

  // -------- Quiz randomisation + exit video tracking --------

  function randomiseQuiz() {
    // Completion + analytics on final video
    try {
      var exitVideo = document.getElementById("exitVideo");
      if (exitVideo) {
        exitVideo.addEventListener("timeupdate", function () {
          if (!exitVideo.duration) return;

          var prog = exitVideo.currentTime / exitVideo.duration;

          // Track best progress and time watched
          var updated = false;
          if (prog > exitVideoMaxProgress) {
            exitVideoMaxProgress = prog;
            updated = true;
          }
          if (exitVideo.currentTime > exitVideoMaxSeconds) {
            exitVideoMaxSeconds = exitVideo.currentTime;
            updated = true;
          }
          if (updated) {
            saveAnalytics();
          }

          // Keep the auto-complete behaviour as well (optional)
          if (prog > 0.9) {
            try {
              var status =
                (LMSGetValue("cmi.core.lesson_status") || "").toLowerCase();
              if (status !== "completed" && status !== "passed") {
                LMSSetValue("cmi.core.lesson_status", "completed");
                LMSCommit();
              }
            } catch (e) {}
          }
        });
      }
    } catch (e) {}

    // Randomise quiz question order
    try {
      var form = document.getElementById("quizForm");
      if (!form) return;
      var sets = Array.from(form.querySelectorAll("fieldset"));
      for (var i = sets.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = sets[i];
        sets[i] = sets[j];
        sets[j] = tmp;
      }
      sets.forEach(function (fs) {
        form.appendChild(fs);
      });
    } catch (e) {}
  }

  // -------- Init --------

  function initAll() {
    initSCORM();
    loadAnalytics();

    showSlide(restoreLocation());

    // Navigation
    if (backBtn)
      backBtn.addEventListener("click", function () {
        showSlide(current - 1);
      });

    if (nextBtn)
      nextBtn.addEventListener("click", function () {
        // On last slide, "Finish" instead of going next
        if (current === slides.length - 1) {
          finishCourse();
          return;
        }
        if (!guardNext()) return;
        showSlide(current + 1);
      });

    // Interactions
    initTrueFalseGate();
    initFlashcards();
    initOrdering();
    initMatching();
    if (submitQuiz) submitQuiz.addEventListener("click", gradeQuiz);
    randomiseQuiz();

    // Enable tap-to-move after dropzones & tiles exist
    initTapToMove();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
