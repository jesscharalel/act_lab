(function () {
  "use strict";
  const TEST_MODE = false;
//copy and repeat this for open AI, and other models as well
  const GEMINI_API_KEY = "AQ.Ab8RN6K8IJOtKe2sESOBtG0F0t8l6-3g4s2_orz_06yasdUonQ";
  const GEMINI_MODEL = "gemini-3.6-flash";
  const API_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEMINI_MODEL + ":generateContent?key=" + GEMINI_API_KEY;

    const OPENAI_API_KEY = "AQ.Ab8RN6K8IJOtKe2sESOBtG0F0t8l6-3g4s2_orz_06yasdUonQ";
    const OPENAI_MODEL = "gpt-3.5-turbo";
    const OPENAI_API_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    OPENAI_MODEL + ":generateContent?key=" + OPENAI_API_KEY;

    const CLAUDE_API_KEY = "AQ.Ab8RN6K8IJOtKe2sESOBtG0F0t8l6-3g4s2_orz_06yasdUonQ";
  const CLAUDE_MODEL = "claude-3-5-sonnet";
  const CLAUDE_API_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    CLAUDE_MODEL + ":generateContent?key=" + CLAUDE_API_KEY;

  const RATINGS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwXXvCkiU3cVH7zkl1LQOWyLrbrB5WryTtoP03DcoVwzeiHWu21LBOxQ89nU336tzlGeQ/exec";

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

  let selectedFile = null;
  let lastDescription = "";
  let lastQuestion = "";
  let lastImageName = "";
  let participantCode = "";

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
  function enterApp() {
    participantCode = participantCodeInput.value.trim();

    // Switch which screen is visible
    loginScreen.classList.remove("active");
    appScreen.classList.add("active");

    // Show what identifier is being used, for the participant's own reference
    participantBadge.textContent = participantCode
      ? "Participant code: " + participantCode
      : "No participant code entered — your IP address will be used to group your responses.";

    // Move focus into the new screen for screen reader / keyboard users
    appScreen.setAttribute("tabindex", "-1");
    appScreen.focus();
  }

  enterBtn.addEventListener("click", enterApp);

  // Let pressing Enter in the participant code field submit too
  participantCodeInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      enterApp();
    }
  });

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
      model: GEMINI_MODEL
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

      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: promptText
                },
                {
                  inline_data: {
                    mime_type: mediaType,
                    data: base64Data
                  }
                }
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