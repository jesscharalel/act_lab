(function () {
  "use strict";
  const TEST_MODE = false;
//copy and repeat this for open AI, and other models as well
  // ---- Model rotation config ----
  // Each entry describes one AI backend. "id" is the internal label written
  // to the ratings spreadsheet — it is never shown to the participant.
  // "call" takes (base64Data, mediaType, promptText) and resolves to a
  // plain-text description string.
  const MODELS = [
    {
      id: "gemini-3.6-flash",
      call: async function (base64Data, mediaType, promptText) {
        const GEMINI_API_KEY = "apikeyhere";
        const GEMINI_MODEL = "gemini-3.6-flash";
        const endpoint =
          "https://generativelanguage.googleapis.com/v1beta/models/" +
          GEMINI_MODEL + ":generateContent?key=" + GEMINI_API_KEY;
 
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: promptText },
                  { inline_data: { mime_type: mediaType, data: base64Data } }
                ]
              }
            ]
          })
        });
 
        if (!response.ok) {
          const errBody = await response.text();
          throw new Error("The server returned an error (status " + response.status + "). " + errBody);
        }
 
        const data = await response.json();
        const candidate = data.candidates && data.candidates[0];
        const text =
          candidate && candidate.content && candidate.content.parts && candidate.content.parts[0]
            ? candidate.content.parts[0].text
            : "";
        if (!text) throw new Error("No description was returned.");
        return text;
      }
    },
    {
      id: "claude-vision",
      call: async function (base64Data, mediaType, promptText) {
        const ANTHROPIC_API_KEY = "apikeyhere";
        const ANTHROPIC_MODEL = "claude-sonnet-4-5";
        const endpoint = "https://api.anthropic.com/v1/messages";
 
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            // Required to call the Anthropic API directly from a browser.
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 500,
            messages: [
              {
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
                  { type: "text", text: promptText }
                ]
              }
            ]
          })
        });
 
        if (!response.ok) {
          const errBody = await response.text();
          throw new Error("The server returned an error (status " + response.status + "). " + errBody);
        }
 
        const data = await response.json();
        const text = data.content && data.content[0] ? data.content[0].text : "";
        if (!text) throw new Error("No description was returned.");
        return text;
      }
    }
  ];
 
  // ISO-8601 week number (1-53), used so the model rotates once a week
  // regardless of how many times the page is loaded.
  function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }
 
  function getModelForThisWeek() {
    const week = getISOWeekNumber(new Date());
    const index = week % MODELS.length;
    return MODELS[index];
  }
 
  // Picked once per page load; every describe request this session uses it.
  const activeModel = getModelForThisWeek();
  let lastModelUsed = activeModel.id;
  const PARTICIPANT_SESSION_KEY = "imageDescriberParticipantId"

  // ---- Login screen elements ----
  const loginScreen = document.getElementById("loginScreen");
  const appScreen = document.getElementById("appScreen");
  const participantCodeInput = document.getElementById("participantCodeInput");
  const enterBtn = document.getElementById("enterBtn");
  const loginStatus = document.getElementById("loginStatus");
  const participantBadge = document.getElementById("participantBadge");

  // ---- Main app elements ----
  const imageInput = document.getElementById("imageInput");
  const imagePreviewWrap = document.getElementById("imagePreviewWrap");
  const imagePreview = document.getElementById("imagePreview");
  const questionInput = document.getElementById("questionInput");
  const describeBtn = document.getElementById("describeBtn");
  const statusMessage = document.getElementById("statusMessage");
  const resultText = document.getElementById("resultText");
  const ratingFieldset = document.getElementById("ratingFieldset");
  const ratingSelect = document.getElementById("ratingSelect");
  const feedbackText = document.getElementById("feedbackText");
  const submitRatingBtn = document.getElementById("submitRatingBtn");
  const ratingStatus = document.getElementById("ratingStatus");
  const saveImageConsent = document.getElementById("saveImageConsent");
  const RATINGS_WEBAPP_URL = "script here"

  let selectedFile = null;
  let lastDescription = "";
  let lastQuestion = "";
  let lastImageName = "";
  let participantId = "";
  let ipAddress = "unknown";
  let browserInfo = {};

  function announce(message) {
    statusMessage.textContent = message;
  }

  function resetRating() {
    ratingSelect.value = "";
    ratingSelect.disabled = false;
    feedbackText.value = "";
    feedbackText.disabled = false;
    submitRatingBtn.disabled = false;
    ratingStatus.textContent = "";
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
    });
  }

  // ---- Login -> main app transition ----
  async function fetchPublicIp() {
    const response = await fetch("https://api.ipify.org?format=json");
    if (!response.ok) {
      throw new Error("Could not determine IP address.");
    }
    const data = await response.json();
    return data.ip;
  }
 
  // Pulls identifying details straight from the browser's own APIs —
  // no external service needed for these, unlike the IP lookup.
  // Useful for a research study to know, e.g., what browser/OS/screen
  // size participants actually used.
  function getBrowserInfo() {
    let timezone = "unknown";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
    } catch (e) {
      // Some very old browsers don't support Intl.DateTimeFormat at all.
    }
 
    return {
      userAgent: navigator.userAgent || "unknown",
      language: navigator.language || "unknown",
      platform: navigator.platform || "unknown",
      screenResolution: (window.screen ? window.screen.width + "x" + window.screen.height : "unknown"),
      timezone: timezone
    };
  }
 
  function showAppScreen() {
    loginScreen.classList.remove("active");
    appScreen.classList.add("active");
    participantBadge.textContent = "Participant ID: " + participantId + " (IP: " + ipAddress + ")";
  }
 
  function persistSession() {
    sessionStorage.setItem(PARTICIPANT_SESSION_KEY, JSON.stringify({
      participantId: participantId,
      ipAddress: ipAddress,
      browserInfo: browserInfo
    }));
  }
 
  async function handleEnter() {
    const code = participantCodeInput.value.trim();
    enterBtn.disabled = true;
 
    browserInfo = getBrowserInfo();
 
    // Always attempt to look up the IP address, regardless of
    // whether a participant code was entered — a code identifies
    // the person, but the IP is recorded alongside it as extra
    // context either way.
    loginStatus.textContent = "Setting things up...";
    try {
      ipAddress = await fetchPublicIp();
    } catch (err) {
      ipAddress = "unknown";
    }
 
    if (code) {
      participantId = code;
    } else {
      participantId = ipAddress !== "unknown" ? "IP:" + ipAddress : "UNKNOWN:" + Date.now();
    }
 
    persistSession();
    showAppScreen();
    enterBtn.disabled = false;
  }

  enterBtn.addEventListener("click", handleEnter);

  // Let pressing Enter in the participant code field submit too
  participantCodeInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEnter();
    }
  });

  (function checkExistingSession() {
    const existingRaw = sessionStorage.getItem(PARTICIPANT_SESSION_KEY);
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw);
        participantId = existing.participantId || "";
        ipAddress = existing.ipAddress || "unknown";
        browserInfo = existing.browserInfo || getBrowserInfo();
        if (participantId) {
          showAppScreen();
        }
      } catch (e) {
        // Corrupted/old-format session value — ignore and show login.
      }
    }
  })();
 

  // ---- Rating submission ----
  async function submitRating() {
    const rating = ratingSelect.value;

    if (!rating) {
      ratingStatus.textContent = "Please choose a rating from 1 to 10 before submitting.";
      ratingSelect.focus();
      return;
    }

    ratingStatus.textContent = "Saving your rating...";

    const payload = {
      timestamp: new Date().toISOString(),
      participantCode: participantCode || "(none — IP address used)",
      imageName: lastImageName,
      question: lastQuestion || "(none — general description)",
      description: lastDescription,
      rating: rating,
      feedback: feedbackText.value.trim() || "(no written feedback)",
      model: lastModelUsed
    };

    try {
      if (!RATINGS_WEBAPP_URL || RATINGS_WEBAPP_URL.indexOf("YOUR_") === 0) {
        throw new Error("Ratings spreadsheet is not connected yet.");
      }

      if (saveImageConsent.checked && selectedFile) {
        ratingStatus.textContent = "Preparing your image for upload...";
        payload.imageData = await fileToBase64(selectedFile);
        payload.imageMimeType = selectedFile.type || "image/jpeg";
        ratingStatus.textContent = "Saving your rating and image...";
      }

      await fetch(RATINGS_WEBAPP_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });

      ratingStatus.textContent = saveImageConsent.checked
        ? "Thanks! Your " + rating + "/10 rating and image were saved."
        : "Thanks! Your " + rating + "/10 rating was saved.";
      ratingSelect.disabled = true;
      feedbackText.disabled = true;
      submitRatingBtn.disabled = true;
    } catch (err) {
      ratingStatus.textContent = "Could not save your rating (" + err.message + ").";
    }
  }

  submitRatingBtn.addEventListener("click", submitRating);

  // ---- Image selection ----
  imageInput.addEventListener("change", function () {
    const file = imageInput.files && imageInput.files[0];
    if (!file) {
      selectedFile = null;
      describeBtn.disabled = true;
      imagePreviewWrap.hidden = true;
      announce("No image selected yet.");
      return;
    }

    selectedFile = file;
    describeBtn.disabled = false;
    ratingFieldset.hidden = true;
    resetRating();

    const reader = new FileReader();
    reader.onload = function (e) {
      imagePreview.src = e.target.result;
      imagePreviewWrap.hidden = false;
    };
    reader.readAsDataURL(file);

    announce("Image \"" + file.name + "\" selected. Press the Describe this image button to hear a description.");
  });

  // ---- Describe image via AI ----
  async function describeImage() {
    if (!selectedFile) return;

    describeBtn.disabled = true;
    resultText.innerHTML = '<p class="placeholder">Working on it&hellip;</p>';
    announce("Analyzing image. Please wait.");
    const question = questionInput.value.trim();

    const promptText = question
      ? "A blind or low-vision user has asked the following question about this image: \"" + question +
        "\". Answer the question directly and clearly first, then add any other important visual context if it's relevant. Keep the answer concise."
      : "Describe this image clearly and concisely for a blind or low-vision person. Describe the most important content first (what the image is of), then relevant details like setting, colors, text, and people if present. Keep it under 100 words unless the image is complex.";

    try {
      if (TEST_MODE) {
        await new Promise(function (resolve) { setTimeout(resolve, 800); });

        const fakeDescription = question
          ? "[TEST MODE] This is a fake answer to your question: \"" + question + "\". In real mode, the AI would answer this based on the actual image."
          : "[TEST MODE] This is a fake description standing in for the AI's real response, so you can test the rating and feedback flow without calling the API.";

        lastDescription = fakeDescription;
        lastQuestion = question;
        lastImageName = selectedFile.name;
        resultText.textContent = fakeDescription;
        resetRating();
        ratingFieldset.hidden = false;
        describeBtn.disabled = false;
        return;
      }

      const base64Data = await fileToBase64(selectedFile);
      const mediaType = selectedFile.type || "image/jpeg";

      const description = await activeModel.call(base64Data, mediaType, promptText);
      lastModelUsed = activeModel.id;
 
      lastDescription = description;
      lastQuestion = question;
      lastImageName = selectedFile.name;
      resultText.textContent = description;
      resetRating();
      ratingFieldset.hidden = false;
    } catch (err) {
      const message = "Something went wrong: " + err.message + ". Please try again.";
      resultText.innerHTML = '<p class="placeholder">' + message + "</p>";
    } finally {
      describeBtn.disabled = false;
    }
  }

  describeBtn.addEventListener("click", describeImage);

  // ---- Hover-to-focus for read-aloud / screen magnifier support ----
  var hoverReadableSelector =
    "button, input, select, textarea, a[href], " +
    "h1, h2, p, legend, .help-text, #resultText, footer p";

  document.querySelectorAll(hoverReadableSelector).forEach(function (el) {
    if (!el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "-1");
    }
    el.addEventListener("mouseenter", function () {
      if (!el.disabled) {
        el.focus();
      }
    });
  });
})();