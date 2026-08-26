(function () {
  "use strict";

  // ============================================
  // CONFIG — edit these values for your setup
  // ============================================

  // Set to true to skip the real Gemini API call and get a fake
  // description back instead. Useful for testing the rating/feedback/
  // sheet flow without burning API quota. Set to false for production.
  const TEST_MODE = false;

  // Get a free API key at https://aistudio.google.com/apikey
  // NEVER paste a real key into a chat, README, or public repo —
  // treat it as compromised the moment it leaves your local machine.
  const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
  const GEMINI_MODEL = "gemini-3.6-flash";
  const API_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEMINI_MODEL + ":generateContent?key=" + GEMINI_API_KEY;

  // Google Apps Script "web app" endpoint that appends rows (and
  // optionally saves images to Drive) for each submitted rating.
  const RATINGS_WEBAPP_URL = "YOUR_APPS_SCRIPT_WEBAPP_URL_HERE";

  // ============================================
  // DOM references
  // ============================================
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
  const saveImageConsent = document.getElementById("saveImageConsent");
  const submitRatingBtn = document.getElementById("submitRatingBtn");
  const ratingStatus = document.getElementById("ratingStatus");

  // ============================================
  // Shared state
  // ============================================
  let selectedFile = null;
  let lastDescription = "";
  let lastQuestion = "";
  let lastImageName = "";

  // ============================================
  // Small helpers
  // ============================================
  function announce(message) {
    statusMessage.textContent = message;
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
    });
  }

  function buildPromptText(question) {
    if (question) {
      return "A blind or low-vision user has asked the following question about this image: \"" +
        question +
        "\". Answer the question directly and clearly first, then add any other " +
        "important visual context if it's relevant. Keep the answer concise.";
    }
    return "Describe this image clearly and concisely for a blind or low-vision person. " +
      "Describe the most important content first (what the image is of), then " +
      "relevant details like setting, colors, text, and people if present. " +
      "Keep it under 100 words unless the image is complex.";
  }

  async function describeImageWithGemini(base64Data, mediaType, promptText) {
    const response = await fetch(API_ENDPOINT, {
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
    const description =
      candidate && candidate.content && candidate.content.parts && candidate.content.parts[0]
        ? candidate.content.parts[0].text
        : "";

    if (!description) {
      throw new Error("No description was returned.");
    }

    return description;
  }

  // ============================================
  // Rating fieldset: reset + submit
  // ============================================
  function resetRating() {
    ratingSelect.value = "";
    ratingSelect.disabled = false;
    feedbackText.value = "";
    feedbackText.disabled = false;
    saveImageConsent.checked = false;
    saveImageConsent.disabled = false;
    submitRatingBtn.disabled = false;
    ratingStatus.textContent = "";
  }

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
      imageName: lastImageName,
      question: lastQuestion || "(none — general description)",
      description: lastDescription,
      rating: rating,
      feedback: feedbackText.value.trim() || "(no written feedback)"
    };

    try {
      if (!RATINGS_WEBAPP_URL || RATINGS_WEBAPP_URL.indexOf("YOUR_") === 0) {
        throw new Error("Ratings spreadsheet is not connected yet.");
      }

      // Only read and attach the actual image bytes if the user opted
      // in. Otherwise no image data is ever read or sent — only the
      // file name.
      if (saveImageConsent.checked && selectedFile) {
        ratingStatus.textContent = "Preparing your image for upload...";
        payload.imageData = await fileToBase64(selectedFile);
        payload.imageMimeType = selectedFile.type || "image/jpeg";
        ratingStatus.textContent = "Saving your rating and image...";
      }

      // text/plain avoids a CORS preflight request, which Google Apps
      // Script web apps don't handle. The Apps Script side still parses
      // this as JSON.
      await fetch(RATINGS_WEBAPP_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });

      // mode: "no-cors" means we can't read the response, so we
      // optimistically assume success once the request is sent.
      ratingStatus.textContent = saveImageConsent.checked
        ? "Thanks! Your " + rating + "/10 rating and image were saved."
        : "Thanks! Your " + rating + "/10 rating was saved.";
      ratingSelect.disabled = true;
      feedbackText.disabled = true;
      saveImageConsent.disabled = true;
      submitRatingBtn.disabled = true;
    } catch (err) {
      ratingStatus.textContent = "Could not save your rating (" + err.message + ").";
    }
  }

  submitRatingBtn.addEventListener("click", submitRating);

  // ============================================
  // Image upload handling
  // ============================================
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

  // ============================================
  // Describe button handling (incl. TEST_MODE)
  // ============================================
  async function describeImage() {
    if (!selectedFile) return;

    describeBtn.disabled = true;
    resultText.innerHTML = '<p class="placeholder">Working on it&hellip;</p>';
    announce("Analyzing image. Please wait.");
    const question = questionInput.value.trim();

    try {
      if (TEST_MODE) {
        // Simulate network delay so the "Working on it..." state is testable too.
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

      const promptText = buildPromptText(question);
      const base64Data = await fileToBase64(selectedFile);
      const mediaType = selectedFile.type || "image/jpeg";

      const description = await describeImageWithGemini(base64Data, mediaType, promptText);

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

  // ============================================
  // HOVER-TO-FOCUS FOR MOUSE + SCREEN READER USERS
  // ============================================
  // Moving keyboard focus onto whatever the mouse hovers is a real
  // focus change — screen readers listen for focus events regardless
  // of what triggered them, so most screen readers WILL announce
  // content brought into focus this way. This helps people who use a
  // mouse alongside a screen reader (common for low-vision users). It
  // won't help someone who never uses a mouse at all (they already
  // get everything via Tab/keyboard navigation as normal).
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