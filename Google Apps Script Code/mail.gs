/**
 * Sends a debug report email with a screenshot.
 * @param {string} details - The text details provided by the user.
 * @param {string} imageData - The Base64 encoded screenshot data.
 * @param {Object} userInfo - Information about the logged-in user.
 * @return {Object} Status of the email sending operation.
 */
function sendDebugEmail(details, imageData, userInfo) {
  try {
    const recipient = "mayank4991@aiims.edu";
    const subject = `Epilepsy App - Debug Report from ${userInfo.username || 'Unknown User'}`;
    
    // Convert the Base64 image data into a blob that can be attached.
    const imageBlob = Utilities.newBlob(
      Utilities.base64Decode(imageData.split(',')[1]), 
      'image/png', 
      'screenshot.png'
    );

    const htmlBody = `
      <html>
        <body>
          <h2>Epilepsy App Debug Report</h2>
          <p><strong>User:</strong> ${userInfo.username || 'N/A'} (${userInfo.role || 'N/A'})</p>
          <p><strong>Facility:</strong> ${userInfo.phc || 'N/A'}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
          <hr>
          <h3>User Details:</h3>
          <p>${details.replace(/\n/g, '<br>')}</p>
          <hr>
          <h3>Screenshot:</h3>
          <img src="cid:screenshot" style="max-width: 100%; border: 1px solid #ccc; max-height: 500px; object-fit: contain;">
        </body>
      </html>
    `;

    // Send the email with the screenshot as an inline attachment
    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      htmlBody: htmlBody,
      inlineImages: {
        screenshot: imageBlob
      },
      noReply: true
    });

    return { 
      status: "success", 
      message: "Debug report sent successfully." 
    };
  } catch (error) {
    console.error('Error sending debug email:', error);
    return {
      status: "error",
      message: `Failed to send debug report: ${error.message}`
    };
  }
}
