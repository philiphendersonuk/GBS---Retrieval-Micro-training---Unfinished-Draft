(function () {
  "use strict";

  // ============================================================
  // Retrieval CPD course
  // Behaviour + light-touch SCORM analytics.
  // No interaction is gated and no score/pass/fail is set here.
  // Formal assessment is intentionally handled separately in the VLE.
  // ============================================================

  var slides = Array.from(document.querySelectorAll(".slide"));
  var backBtn = document.getElementById("backBtn");
  var nextBtn = document.getElementById("nextBtn");
  var slideNum = document.getElementById("slideNum");
  var slideCount = document.getElementById("slideCount");
  var progressLabel = document.getElementById("progressLabel");
  var progressFill = document.getElementById("progressFill");

  var current = 0;
  var selectedSortCard = null;
  var selectedTimelineItem = null;
  var dragged = null;

  var analytics = {
    version: 1,
    reviewVsRetrieval: {
      attempted: false,
      firstResponse: null,
      latestResponse: null
    },
    retrievalSort: {
      attempted: false,
      attempts: 0,
      firstScore: null,
      bestScore: 0
    },
    memoryExperiment: {
      attempted: false
    },
    scenarioComparison: {
      attempted: false,
      firstResponse: null,
      latestResponse: null
    },
    principle1InitialRecall: {
      attempted: false
    },
    principle1DelayedRecall: {
      attempted: false
    },
    timeline: {
      attempted: false,
      placements: {}
    },
    resources: {
      planningTemplateDownloaded: false
    }
  };

  // ---------------- SCORM ----------------

  function initSCORM() {
    try {
      LMSInitialize();

      var status = LMSGetValue("cmi.core.lesson_status") || "";
      if (!status || String(status).toLowerCase() === "not attempted") {
        LMSSetValue("cmi.core.lesson_status", "incomplete");
      }

      loadAnalytics();
      LMSCommit();
    } catch (e) {
      // Course still works when opened outside an LMS.
    }
  }

  function saveAnalytics() {
    try {
      LMSSetValue("cmi.suspend_data", JSON.stringify(analytics));
      LMSCommit();
    } catch (e) {}
  }

  function loadAnalytics() {
    try {
      var raw = LMSGetValue("cmi.suspend_data");
      if (!raw) return;

      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;

      // Merge saved top-level sections without assuming every old field exists.
      Object.keys(analytics).forEach(function (key) {
        if (saved[key] === undefined) return;
        if (
          analytics[key] &&
          typeof analytics[key] === "object" &&
          !Array.isArray(analytics[key]) &&
          saved[key] &&
          typeof saved[key] === "object"
        ) {
          analytics[key] = Object.assign({}, analytics[key], saved[key]);
        } else {
          analytics[key] = saved[key];
        }
      });
    } catch (e) {
      // Ignore malformed or unavailable suspend_data.
    }
  }

  function restoreLocation() {
    try {
      var loc = LMSGetValue("cmi.core.lesson_location");
      var idx = parseInt(loc, 10);
      if (!isNaN(idx) && idx >= 0 && idx < slides.length) return idx;
    } catch (e) {}
    return 0;
  }

  function saveLocation() {
    try {
      LMSSetValue("cmi.core.lesson_location", String(current));
      LMSCommit();
    } catch (e) {}
  }

  function completeCourse() {
    try {
      var status = (LMSGetValue("cmi.core.lesson_status") || "").toLowerCase();
      if (status !== "completed" && status !== "passed") {
        LMSSetValue("cmi.core.lesson_status", "completed");
      }
      saveAnalytics();
      LMSCommit();
    } catch (e) {}
  }

  // ---------------- Navigation ----------------

  function showSlide(index) {
    current = Math.max(0, Math.min(index, slides.length - 1));

    slides.forEach(function (slide, i) {
      slide.classList.toggle("active", i === current);
    });

    if (slideNum) slideNum.textContent = String(current + 1);
    if (slideCount) slideCount.textContent = String(slides.length);
    if (progressLabel) progressLabel.textContent = (current + 1) + " of " + slides.length;
    if (progressFill) {
      progressFill.style.width = (((current + 1) / slides.length) * 100) + "%";
    }

    if (backBtn) backBtn.disabled = current === 0;
    if (nextBtn) nextBtn.style.visibility = current === slides.length - 1 ? "hidden" : "visible";

    saveLocation();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initNavigation() {
    if (slideCount) slideCount.textContent = String(slides.length);

    if (backBtn) {
      backBtn.addEventListener("click", function () {
        showSlide(current - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        showSlide(current + 1);
      });
    }
  }

  // ---------------- Slide 2: research-source reveals ----------------

  function initSourceCards() {
    document.querySelectorAll(".source-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.classList.toggle("open");
      });
    });
  }

  // ---------------- Slide 4: initial Principle 1 recall ----------------

  function initInitialRecall() {
    var btn = document.getElementById("revealP1");
    var input = document.getElementById("principle1Recall");
    var feedback = document.getElementById("p1Feedback");
    if (!btn || !feedback) return;

    btn.addEventListener("click", function () {
      analytics.principle1InitialRecall.attempted =
        !!(input && input.value.trim());
      saveAnalytics();
      feedback.classList.add("show");
    });
  }

  // ---------------- Slide 5: retrieval vs re-exposure ----------------

  function initReviewChoice() {
    var choices = Array.from(document.querySelectorAll("#reviewChoices .choice"));
    var feedback = document.getElementById("reviewFeedback");
    var check = document.getElementById("checkReview");
    if (!choices.length || !feedback || !check) return;

    choices.forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.classList.toggle("selected");
      });
    });

    check.addEventListener("click", function () {
      var selected = choices.filter(function (x) { return x.classList.contains("selected"); });
      var keys = selected.map(function (x) { return x.dataset.key; }).sort().join(",");
      analytics.reviewVsRetrieval.attempted = true;
      if (analytics.reviewVsRetrieval.firstResponse === null) analytics.reviewVsRetrieval.firstResponse = keys;
      analytics.reviewVsRetrieval.latestResponse = keys;
      saveAnalytics();

      var correct = selected.length === 2 && selected.every(function (x) { return x.dataset.answer === "retrieval"; });
      if (correct) {
        feedback.innerHTML = "<strong>Correct — C and D involve retrieval.</strong> In both cases, students must bring previous learning back to mind. A, B and E revisit previous learning through <strong>re-exposure</strong>: the information is provided to students again.";
      } else {
        feedback.innerHTML = "<strong>Not quite.</strong> Select the two options where students have to generate the previous learning from memory, rather than being shown or told it again.";
      }
      feedback.classList.add("show");
    });
  }

  // ---------------- Generic drag + tap helpers ----------------

  function handleDragStart(e) {
    dragged = e.currentTarget;
    try {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragged.textContent.trim());
      }
    } catch (err) {}
  }

  function allowDrop(zone) {
    zone.addEventListener("dragover", function (e) {
      e.preventDefault();
      zone.style.borderColor = "var(--brand)";
    });

    zone.addEventListener("dragleave", function () {
      zone.style.borderColor = "";
    });

    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.style.borderColor = "";
      if (!dragged) return;
      zone.appendChild(dragged);
      dragged = null;
    });
  }

  // ---------------- Slide 6: retrieval / re-exposure sorter ----------------

  function initRetrievalSort() {
    var bank = document.getElementById("sortBank");
    var retrievalTarget = document.getElementById("retrievalTarget");
    var reexposureTarget = document.getElementById("reexposureTarget");
    var placeRetrieval = document.getElementById("placeRetrieval");
    var placeReexposure = document.getElementById("placeReexposure");
    var check = document.getElementById("checkSort");
    var feedback = document.getElementById("sortFeedback");

    if (!bank || !retrievalTarget || !reexposureTarget) return;

    var cards = Array.from(bank.querySelectorAll(".sort-card"));

    // Randomise starting order so the intended categories do not alternate predictably.
    for (var i = cards.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = cards[i];
      cards[i] = cards[j];
      cards[j] = tmp;
    }
    cards.forEach(function (card) {
      bank.appendChild(card);
      card.setAttribute("draggable", "true");
      card.addEventListener("dragstart", handleDragStart);

      card.addEventListener("click", function (e) {
        e.stopPropagation();
        document.querySelectorAll(
          "#sortBank .sort-card, #retrievalTarget .sort-card, #reexposureTarget .sort-card"
        ).forEach(function (x) { x.style.outline = ""; });

        selectedSortCard = card;
        card.style.outline = "3px solid var(--brand)";
      });
    });

    [bank, retrievalTarget, reexposureTarget].forEach(allowDrop);

    function moveSelected(target) {
      if (!selectedSortCard) return;
      selectedSortCard.style.outline = "";
      target.appendChild(selectedSortCard);
      selectedSortCard = null;
    }

    if (placeRetrieval) {
      placeRetrieval.addEventListener("click", function () {
        moveSelected(retrievalTarget);
      });
    }

    if (placeReexposure) {
      placeReexposure.addEventListener("click", function () {
        moveSelected(reexposureTarget);
      });
    }

    if (check && feedback) {
      check.addEventListener("click", function () {
        var placed = Array.from(
          document.querySelectorAll("#retrievalTarget .sort-card, #reexposureTarget .sort-card")
        );

        if (placed.length < cards.length) {
          feedback.textContent = "Place all eight examples before checking.";
          feedback.classList.add("show");
          return;
        }

        var correct = 0;
        placed.forEach(function (card) {
          var zone = card.parentElement.dataset.zone;
          if (card.dataset.correct === zone) correct++;
        });

        analytics.retrievalSort.attempted = true;
        analytics.retrievalSort.attempts += 1;
        if (analytics.retrievalSort.firstScore === null) {
          analytics.retrievalSort.firstScore = correct;
        }
        analytics.retrievalSort.bestScore =
          Math.max(analytics.retrievalSort.bestScore || 0, correct);
        saveAnalytics();

        feedback.innerHTML =
          "<strong>" + correct + "/8 placed as intended.</strong> " +
          "The key distinction is whether students must generate the previous learning from memory, rather than encounter it again.";
        feedback.classList.add("show");
      });
    }
  }

  // ---------------- Slide 7: pathway reveals ----------------

  function initPathway() {
    document.querySelectorAll(".mini-reveal").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.parentElement.classList.toggle("open");
      });
    });
  }

  // ---------------- Slides 8–9: memory retrieval experience ----------------

  function initMemoryExperiment() {
    var ready = document.getElementById("memoryReady");
    var study = document.getElementById("memoryStudy");
    var distractor = document.getElementById("memoryDistractor");
    var timer = document.getElementById("distractTimer");
    var recall = document.getElementById("memoryRecall");
    var input = document.getElementById("memoryInput");
    var done = document.getElementById("memoryDone");

    if (ready && study && distractor && timer && recall) {
      ready.addEventListener("click", function () {
        study.style.display = "none";
        distractor.style.display = "grid";

        var n = 10;
        timer.textContent = String(n);

        var interval = setInterval(function () {
          n -= 1;
          timer.textContent = String(n);

          if (n <= 0) {
            clearInterval(interval);
            distractor.style.display = "none";
            recall.style.display = "block";
          }
        }, 1000);
      });
    }

    if (done) {
      done.addEventListener("click", function () {
        analytics.memoryExperiment.attempted = true;
        saveAnalytics();

        // The learner's typed words are deliberately NOT sent to the LMS.
        // They are used only locally to give the learner a private self-check.
        try {
          sessionStorage.setItem(
            "retrievalMemoryRecall",
            input ? input.value.trim() : ""
          );
        } catch (e) {}

        showSlide(8);
        updateRecallCount();
      });
    }
  }

  function updateRecallCount() {
    var output = document.getElementById("recallCount");
    if (!output) return;

    var text = "";
    try {
      text = sessionStorage.getItem("retrievalMemoryRecall") || "";
    } catch (e) {}

    if (!text) {
      output.textContent = "";
      return;
    }

    var words = [
      "river", "candle", "bicycle", "lemon", "window",
      "tiger", "button", "guitar", "cloud", "key"
    ];

    var lower = text.toLowerCase();
    var hit = words.filter(function (word) {
      return new RegExp("\\b" + word + "\\b", "i").test(lower);
    }).length;

    output.textContent =
      "You recalled " + hit +
      " of the 10 words. This is not scored; the important part was the attempt to retrieve them.";
  }

  // ---------------- Slide 10: flip cards ----------------

  function initFlipCards() {
    document.querySelectorAll("[data-flip]").forEach(function (card) {
      card.setAttribute("tabindex", "0");

      function toggle() {
        card.classList.toggle("show");
      }

      card.addEventListener("click", toggle);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  // ---------------- Slide 12: scenario comparison ----------------

  function initScenario() {
    var choices = Array.from(document.querySelectorAll("#scenarioChoices .choice"));
    var feedback = document.getElementById("scenarioFeedback");
    if (!choices.length || !feedback) return;

    choices.forEach(function (btn) {
      btn.addEventListener("click", function () {
        choices.forEach(function (x) { x.classList.remove("selected"); });
        btn.classList.add("selected");

        var response = btn.dataset.answer || "";
        analytics.scenarioComparison.attempted = true;
        if (analytics.scenarioComparison.firstResponse === null) {
          analytics.scenarioComparison.firstResponse = response;
        }
        analytics.scenarioComparison.latestResponse = response;
        saveAnalytics();

        if (response === "b") {
          feedback.innerHTML =
            "<strong>Teacher B provides the stronger retrieval opportunity.</strong> " +
            "Students first have to generate the key ideas from memory, then receive feedback by comparing their recall with the summary.";
        } else {
          feedback.innerHTML =
            "<strong>Teacher A provides review through re-exposure.</strong> " +
            "Students encounter the information again, but they are not required to retrieve it first.";
        }
        feedback.classList.add("show");
      });
    });
  }

  // ---------------- Slide 13: delayed Principle 1 recall ----------------

  function initDelayedRecall() {
    var btn = document.getElementById("revealP1Again");
    var input = document.getElementById("p1Again");
    var feedback = document.getElementById("p1AgainFeedback");
    if (!btn || !feedback) return;

    btn.addEventListener("click", function () {
      analytics.principle1DelayedRecall.attempted =
        !!(input && input.value.trim());
      saveAnalytics();
      feedback.classList.add("show");
    });
  }

  // ---------------- Slide 14: retrieval timeline ----------------

  function initTimeline() {
    var bank = document.getElementById("timelineBank");
    var boxes = Array.from(document.querySelectorAll(".timebox"));
    if (!bank || !boxes.length) return;

    function selectItem(item) {
      document.querySelectorAll(".time-source, .timeitem").forEach(function (x) {
        x.style.outline = "";
      });
      selectedTimelineItem = item;
      item.style.outline = "3px solid var(--brand)";
    }

    Array.from(bank.querySelectorAll(".time-source")).forEach(function (item) {
      item.setAttribute("draggable", "true");
      item.addEventListener("dragstart", handleDragStart);
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        selectItem(item);
      });
    });

    allowDrop(bank);
    boxes.forEach(function (box) {
      allowDrop(box);

      box.addEventListener("click", function () {
        if (!selectedTimelineItem) return;
        selectedTimelineItem.style.outline = "";
        box.appendChild(selectedTimelineItem);
        selectedTimelineItem = null;
        recordTimeline();
      });

      box.addEventListener("drop", function () {
        setTimeout(recordTimeline, 0);
      });
    });

    function recordTimeline() {
      var placements = {};
      boxes.forEach(function (box) {
        placements[box.dataset.time] =
          Array.from(box.querySelectorAll(".time-source, .timeitem"))
            .map(function (item) { return item.textContent.trim(); });
      });

      analytics.timeline.attempted =
        Object.keys(placements).some(function (key) {
          return placements[key].length > 0;
        });
      analytics.timeline.placements = placements;
      saveAnalytics();
    }
  }

  // ---------------- Slide 15: resource + completion ----------------

  function initCompletion() {
    var download = document.getElementById("downloadTemplate");
    var complete = document.getElementById("completeCourse");
    var feedback = document.getElementById("completeFeedback");

    if (download) {
      download.addEventListener("click", function () {
        var a = document.createElement("a");
        a.href = "Retrieval-Planning-Template.docx";
        a.download = "Retrieval-Planning-Template.docx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        analytics.resources.planningTemplateDownloaded = true;
        saveAnalytics();
      });
    }

    if (complete) {
      complete.addEventListener("click", function () {
        completeCourse();
        if (feedback) feedback.classList.add("show");
      });
    }
  }

  // ---------------- Init ----------------

  function initAll() {
    initSCORM();
    initNavigation();

    initSourceCards();
    initInitialRecall();
    initReviewChoice();
    initRetrievalSort();
    initPathway();
    initMemoryExperiment();
    initFlipCards();
    initScenario();
    initDelayedRecall();
    initTimeline();
    initCompletion();

    current = restoreLocation();
    showSlide(current);
    updateRecallCount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
