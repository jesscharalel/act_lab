function authorizeDriveAccess() {
  const folder = DriveApp.getFolderById("1X9ShD7K9gXInyqgLRDtiEb_SqGaIU0XN");
  const testFile = folder.createFile(Utilities.newBlob("test", "text/plain", "authorization-test.txt"));
  testFile.setTrashed(true); // cleans up the test file immediately after
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);

  const FOLDER_ID = "1X9ShD7K9gXInyqgLRDtiEb_SqGaIU0XN";

  const utcDate = new Date(data.timestamp);
  const easternTimestamp = Utilities.formatDate(
    utcDate,
    "America/New_York",
    "yyyy-MM-dd HH:mm:ss z" // e.g. "2026-08-13 13:01:57 EDT"
  );

  let imageValue = data.imageName || "(not saved)";

  if (data.imageData) {
    try {
      const folder = DriveApp.getFolderById(FOLDER_ID);

      // Turn the ISO timestamp into a filename-safe string,
      // e.g. "2026-08-13T17:01:57.229Z" -> "2026-08-13_17-01-57"
      const safeTimestamp = Utilities.formatDate(
        utcDate,
        "America/New_York",
        "yyyy-MM-dd_HH-mm-ss"
      );
      // Pick a file extension based on the image's MIME type
      const mimeToExt = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp"
      };
      const extension = mimeToExt[data.imageMimeType] || "jpg";

      const filename = safeTimestamp + "." + extension;

      const blob = Utilities.newBlob(
        Utilities.base64Decode(data.imageData),
        data.imageMimeType || "image/jpeg",
        filename
      );
      const file = folder.createFile(blob);
      imageValue = file.getUrl();
    } catch (err) {
      imageValue = "ERROR_SAVING_IMAGE: " + err.message;
    }
  }

  sheet.appendRow([
    data.timestamp,
    easternTimestamp,
    data.participantCode || "(none — IP address used)",
    imageValue,
    data.question,
    data.description,
    data.rating,
    data.feedback,
    data.modelUsed || "(unknown)"
  ]);

  return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}