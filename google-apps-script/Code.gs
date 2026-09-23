/**
 * BCE FACULTY FEEDBACK PORTAL — GOOGLE APPS SCRIPT CONNECTOR
 * 
 * Purpose: Provides native Form → Sheet destination linking and
 * official post-submission confirmation message configuration:
 * - FormApp.setDestination(FormApp.DestinationType.SPREADSHEET, sheetId)
 * - FormApp.setConfirmationMessage(confirmationMessage)
 * - FormApp.setShowLinkToRespondAgain(true)
 * 
 * Deployment:
 * 1. Create a new Apps Script project at https://script.google.com
 * 2. Paste this code into Code.gs
 * 3. Deploy > New Deployment > Web app:
 *    - Execute as: Me (your Google account)
 *    - Who has access: Anyone (or restricted with secret token)
 * 4. Copy the Web App URL and add to your .env.local:
 *    GOOGLE_APPS_SCRIPT_URL="https://script.google.com/macros/s/.../exec"
 *    GOOGLE_APPS_SCRIPT_SECRET="your-chosen-secret"
 */

var CANONICAL_DEFAULT_CONFIRMATION_MESSAGE = [
  'Your response has been recorded.',
  '',
  'More Feedback Forms',
  '',
  'Need to access more academic feedback forms?',
  '',
  'Visit:',
  'https://feedback-management-system-kappa.vercel.app/',
  '',
  'Developer: Aditya Kumar Sah',
  '',
  'Portfolio:',
  'https://portfolio-two-ashen-zseywond41.vercel.app/'
].join('\n');

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 10s timeout
    
    var data;
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      data = {};
    }
    
    // Optional secret check
    var scriptSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (scriptSecret && data.secret !== scriptSecret) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: 'Invalid or missing secret' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var action = data.action;
    var formId = data.formId;
    var sheetId = data.sheetId;
    var confirmationMessage = data.confirmationMessage || CANONICAL_DEFAULT_CONFIRMATION_MESSAGE;

    if (action === 'configureFormConfirmation' || action === 'configureForm') {
      if (!formId) {
        return ContentService.createTextOutput(
          JSON.stringify({ success: false, error: 'formId is required' })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var configResult = configureFormConfirmation(formId, confirmationMessage);
      return ContentService.createTextOutput(
        JSON.stringify(configResult)
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'linkFormToSheet' || !action) {
      if (!formId || !sheetId) {
        return ContentService.createTextOutput(
          JSON.stringify({ success: false, error: 'formId and sheetId are required' })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      
      var linkResult = linkFormToSheet(formId, sheetId, confirmationMessage);
      return ContentService.createTextOutput(
        JSON.stringify(linkResult)
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: 'Unknown action: ' + action })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'active',
      service: 'BCE Faculty Feedback Portal Apps Script Connector',
      version: '1.1.0'
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Links a Google Form directly to a Google Spreadsheet natively
 * and configures the post-submission confirmation message.
 */
function linkFormToSheet(formId, sheetId, confirmationMessage) {
  var form = FormApp.openById(formId);
  if (sheetId) {
    form.setDestination(FormApp.DestinationType.SPREADSHEET, sheetId);
  }
  
  var msg = confirmationMessage || CANONICAL_DEFAULT_CONFIRMATION_MESSAGE;
  form.setConfirmationMessage(msg);
  form.setShowLinkToRespondAgain(true);
  
  return {
    success: true,
    formId: formId,
    sheetId: sheetId,
    destinationType: 'NATIVE_SHEET',
    confirmationConfigured: true,
    message: 'Google Form response destination successfully connected to Google Sheet and confirmation message configured.'
  };
}

/**
 * Configures the Google Form post-submission confirmation message
 * and ensures "Submit another response" link is visible.
 */
function configureFormConfirmation(formId, confirmationMessage) {
  var form = FormApp.openById(formId);
  var msg = confirmationMessage || CANONICAL_DEFAULT_CONFIRMATION_MESSAGE;
  form.setConfirmationMessage(msg);
  form.setShowLinkToRespondAgain(true);

  return {
    success: true,
    formId: formId,
    confirmationConfigured: true,
    message: 'Google Form confirmation message and respond-again link successfully configured.'
  };
}
