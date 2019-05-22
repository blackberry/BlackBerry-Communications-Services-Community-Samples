/* Copyright (c) 2019 BlackBerry Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

const BBMEnterprise = require('bbm-enterprise');
const crypto = require('crypto');
var dbConnector = require("./DBConnector.js");

//This sample is not integrated with an identity provider.  Create a fake username and 
//password below to identify this application instance.
const SPARK_USER_NAME = "";
const SPARK_PASSWORD = "";

//Register for a domain using your BlackBerry Online Account and populate the domain below.
//https://developer.blackberry.com/files/bbm-enterprise/documents/guide/html/gettingStarted.html
const SPARK_DOMAIN = "";

const TYPE_TEMPERATURE_REPORT = "tempReport";

// Initialize the SDK.
const sparkComms = new BBMEnterprise({
    // The domain that was provided to you when you registered to use the SDK.
    // This will be of the form XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX. where each
    // X is a lowercase character or number.
    domain: SPARK_DOMAIN,

    // It is recommended that you do your development and integration testing in
    // the sandbox environment.
    environment: 'Sandbox',

    // This is the identity of the user to log in as, as provided by the
    // identity provider module.
    userId: SPARK_USER_NAME,

    //The amount of log output to produce. 0 produces the least logging, 3 produces the most. 
    //The default is 2 if unspecified.
    logLevel: 0,

    // This function is called when the SDK needs an access token.  Your
    // application must return a promise of the new access token.  In this
    // example, access tokens are supplied by the MockAuthManager.
    getToken: () => {
        // Because the Support library for JavaScript does not currently support
        // Node.js, we must generate these unsigned JWT tokens manually.
        const jti = BBMEnterprise.Util.base64urlEncode(
          new Uint8Array(crypto.randomBytes(20))
        ).substring(0, 18);
    
        // The current time, in seconds.
        const now = (Date.now() / 1000) | 0;
    
        // Create the JWT header and body.
        const tokenHeader = BBMEnterprise.Util.base64urlEncode(JSON.stringify({
          alg: 'none'
        }));
        const tokenBody = BBMEnterprise.Util.base64urlEncode(JSON.stringify({
          jti: jti,
          sub: SPARK_USER_NAME,
          iat: now,
          // Expires in one hour.
          exp: now + 3600
        }));
    
        return Promise.resolve(`${tokenHeader}.${tokenBody}.`);
      },

    // A description of the client. This will be used to describe this endpoint
    // when using endpoint management functionality. This should never be empty.
    // The description can be a maximum of 2000 Unicode Code Points.
    description: 'Thread Sensor Collector - Node ' + process.version,

    // A friendly name in addition to the description.  The nickname is optional
    // and should be set by a user, if desired.
    nickname: 'Thread Sensor Collector - Node'
});

// Register to handle the setupState events.
sparkComms.on('setupState', state => {
    switch (state.value) {
        case BBMEnterprise.SetupState.Success:
            // Setup succeeded!  Your application can now begin using the Messenger
            // and Media interfaces.
            console.log("Spark Comms ready with ID: " + 
                sparkComms.getRegistrationInfo().regId);
            setupCollectorChats();
            break;

        case BBMEnterprise.SetupState.SyncRequired: {
            // The user's keys are ready to be synced with KMS.  The syncPasscodeState
            // indicates whether or not the user has existing keys.
            console.log("Spark Comms setup sync required.");
            switch (sparkComms.syncPasscodeState) {
                case BBMEnterprise.SyncPasscodeState.New:
                    // The user does not have any keys stored in KMS.  New keys will be
                    // created for them using the passcode entered by the user.
                    console.log("Sync new");
                    sparkComms.syncStart(SPARK_PASSWORD,
                        BBMEnterprise.SyncStartAction.New);
                    break;

                case BBMEnterprise.SyncPasscodeState.Existing:
                    // The user has existing keys stored in KMS.  To use the existing keys,
                    // start the sync with 'Existing'.  To create new keys for the user,
                    // start the sync with 'New'.
                    console.log("Sync existing.");
                    sparkComms.syncStart(SPARK_PASSWORD,
                        BBMEnterprise.SyncStartAction.Existing);
                    break;
            }
            break;
        }

        case BBMEnterprise.SetupState.SyncStarted:
            // Syncing of the keys from KMS has started.  If syncing fails, the
            // setupState will revert to 'SyncRequired' to allow your application to
            // try a new passcode or generate new keys.
            //
            // This state allows your application to track if an attempt to sync the
            // keys has been made or not.
            console.log("Setup sync started.");
            break;
    }
});

// Register to handle setupError events.
sparkComms.on('setupError', error => {
    console.log(`Endpoint setup failed: ${error.value}`);
});


//A chat was created
sparkComms.messenger.on('chatAdded', addedEvent => {
    console.log("Chat added with chat ID " + addedEvent.chat.chatId + " with state: " 
        + addedEvent.chat.state);

});

//Verify valid chats exist for each collector.
async function setupCollectorChats() {
    let chats = sparkComms.messenger.getChats();
    console.log("Chats retrieved: " + chats.length);       

    for (let count = 0; count < chats.length; count++) 
    {
        //Check the chat status and fetch messages for waiting chats.
        if (chats[count].state === BBMEnterprise.Messenger.Chat.State.Ready)
        {
            //Chat is ready.
            console.log("Chat is ready. " + chats[count].chatId);
        }
        else if (chats[count].state === BBMEnterprise.Messenger.Chat.State.Waiting)
        {
            console.log("Chat waiting to be restored. " + chats[count].chatId);

            /*
            * This commented code is the appropriate way to request unread messages
            * be restored, which prevents the app from re-processing messages.
            * Due to issue JI:2703582 BBM-67850, the SDK is ignoring the SyncToRead syncMode
            * used below, resulting in the reprocessing of messages.  
            * To work around this, getUnreadCount is called, which triggers restoration
            * of unread messages.

            sparkComms.messenger.fetchChatMessages(
              chats[count].chatId,
              // Restore a minimum of all unread content.
              { syncMode: BBMEnterprise.Messenger.SyncMode.SyncToRead }
            );
            */
            //!!!!!!!!!!!!!!!START WORKAROUND
            try
            {
                sparkComms.messenger.getUnreadCount(chats[count].chatId);
            }
            catch (error)
            {
                console.log("Failed to get unread messages: " + error.toString());
            }
            //!!!!!!!!!!!!!!!END WORKAROUND
        }
        else if (chats[count].state === BBMEnterprise.Messenger.Chat.State.Restoring)
        {
            console.log("Chat is being restored. " + chats[count].chatId);
        }
        else if (chats[count].state === BBMEnterprise.Messenger.Chat.State.Defunct)
        {
            console.log("Chat is defunct. " + chats[count].chatId);
        }        
    }

    let collectors = await dbConnector.getCollectors();

    if (collectors != null) {
        collectors.forEach((row) => {
            //Create a new chat.  If the chat already exists, the existing chat will be reused.
            exports.createChat(row.sparkRegID);               
        });
    }

}

exports.setupSpark = function () {
    // Start the SDK.
    sparkComms.setupStart();
}

//Create a new chat
exports.createChat = async function (sparkRegID) {
    try
    {
        let chat = await sparkComms.messenger.chatStart({
            subject: "Temperature Exchange",
            isOneToOne: true,
            invitees: sparkRegID
        });

        console.log("Created chat with ID: " + chat.chat.chatId);
    }
    catch (err)
    {
        console.log("Failed to create chat: " + err);
    }
}

//Bulk message update, as a result of fetchMessages call made after a chat has been restored.
//Process and store any unread messages.
sparkComms.messenger.on('chatMessageListUpdated', addedEvent => {
    totalMessages = addedEvent.messages.length;

    console.log("Message list updated for chat ID " + addedEvent.chat.chatId + " with " 
        + totalMessages + " messages.");

    for (let num = 0; num < totalMessages; num++)
    {
        processMessage(addedEvent.messages[num]);
    }
});

//Act on incoming messages.
sparkComms.messenger.on('chatMessageAdded', addedEvent => {
    processMessage(addedEvent.message);
});

sparkComms.messenger.on('chatUpdated', updatedEvent => {
    console.log('Chat Updated: ' + updatedEvent.chat );
});

// A helper to mark a message as read.  The marking of the message as read may
// be deferred until the chat has been restored and is in the 'Ready' state.
let deferredReadMap = new Map();
function markChatMessageAsReadOrDefer(message) {
  function markMessageAsRead(chatId, messageId) {
    console.log("Marking message as read; " + messageId);

    //Mark the message as read.
    sparkComms.messenger.chatMessageRead(chatId, messageId).then(function(value) 
    {
        console.log("Marked message read: " + messageId);
    }).catch((reason) =>
    {
        console.log("Error marking message as read: " + reason.toString());
    });
  }

  //The SDK does not currently allow chats that are not yet restored to
  //flag messages as read.  So, if the chat state is 'Ready', we can mark the
  //message as read immediately.
  if (sparkComms.messenger.getChat(message.chatId).state ===
      BBMEnterprise.Messenger.Chat.State.Ready)
  {
    markMessageAsRead(message.chatId, message.messageId);
    return;
  }

  //Otherwise, we will defer marking the message as read until the chat is
  //'Ready'.
  console.log("Deferring marking message as read: " + message.messageId);

  //Remember only the latest deferred messageId for the chat.
  //Marking the most recent messages as read will mark all previous
  //messages as read.
  const previousDeferredMessageId = deferredReadMap.get(message.chatId);
  if (previousDeferredMessageId === undefined) {
    //Schedule the message to be read when the chat state is updated
    //to 'Read'.
    deferredReadMap.set(message.chatId, message.messageId);

    // We need to create a deferred read handler that will take action when
    // the chat state changes to 'Read'.  But we only need to do this for the
    // first deferred read registered.  We will remove the handler when the
    // last deferred read has been handled.
    if (deferredReadMap.size === 1) {
      console.log("Registering deferred read handler");
      sparkComms.messenger.on('chatUpdated', function deferredReadHandler(event) {
        const chat = event.chat;
        console.log("Deferred read handler: " + chat);
        const messageId = deferredReadMap.get(chat.chatId);
        if (messageId !== undefined &&
            chat.state === BBMEnterprise.Messenger.Chat.State.Ready)
        {
          markMessageAsRead(chat.chatId, messageId);
          deferredReadMap.delete(chat.chatId);

          //If there are no more deferredReads to process.  Remove this event
          //handler.
          if (deferredReadMap.size === 0) {
            console.log("Deregistering deferred read handler");
            sparkComms.messenger.removeListener('chatUpdated', deferredReadHandler);
          }
        }
      });
    }
  }
  else {
    // We have already scheduled the action to mark a message as read for
    // this chat.   We only want to mark the newest messageId as read in the
    // chat, as this will mark all earlier messages as read at the same
    // time.
    if (previousDeferredMessageId.toString() < message.messageId.toString()) {
      deferredReadMap.set(message.chatId, message.messageId);
    }
  }
}

function processMessage(message)
{
    //Ignore sent, failed and read messages.
    if (message.isIncoming &&
        message.tag === 'Text' &&
        message.state.value === BBMEnterprise.Messenger.ChatMessage.StateValue.Delivered)
    {
        var theJSON = message.data;

        if (typeof theJSON !== 'undefined' && typeof theJSON.type !== 'undefined' 
            && theJSON.type === TYPE_TEMPERATURE_REPORT)
        {
            //Process the temperature report.
            processTemperatureReport(theJSON);
        }

        markChatMessageAsReadOrDefer(message);
    }
}

//Parses the temperature reports and inserts them into the database.
//For simplicity, this demo ignores potential lost reports due to failure
//to write the the database.
function processTemperatureReport(reportJSON)
{
    let totalReports = reportJSON.temperatureReports.length;

    for (let count = 0; count < totalReports; count++)
    {
        dbConnector.insertTemperatureReport(reportJSON.collector, 
            reportJSON.temperatureReports[count].deviceID, 
            reportJSON.temperatureReports[count].temperature, 
            reportJSON.temperatureReports[count].reportTime);

        console.log("New Report: Device: " + reportJSON.temperatureReports[count].deviceID + 
            " Temperature: " + reportJSON.temperatureReports[count].temperature + 
            " Time: " + reportJSON.temperatureReports[count].reportTime);
    }
}
