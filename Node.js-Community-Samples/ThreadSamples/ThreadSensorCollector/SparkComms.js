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

//This sample is not integrated with an identity provider.  Create a fake username and 
//password below to identify this application instance.
const SPARK_USER_NAME = "";
const SPARK_PASSWORD = "";

//Register for a domain using your BlackBerry Online Account and populate the domain below.
//https://developer.blackberry.com/files/bbm-enterprise/documents/guide/html/gettingStarted.html
const SPARK_DOMAIN = "";


var activeChatID = "";

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
    nickname: 'Thread Sensor Collector - Node',

});

// Register to handle the setupState events.
sparkComms.on('setupState', state => {
    switch (state.value) {
        case BBMEnterprise.SetupState.Success:
            // Setup succeeded!  Your application can now begin using the Messenger
            // and Media interfaces.
            console.log("Spark Comms ready with ID: " + 
                sparkComms.getRegistrationInfo().regId);
            setupReportChat();
            break;

        case BBMEnterprise.SetupState.SyncRequired: {
            // The user's keys are ready to be synced with KMS.  The syncPasscodeState
            // indicates whether or not the user has existing keys.
            console.log("Spark Comms setup sync required.");
            switch (sparkComms.syncPasscodeState) {
                case BBMEnterprise.SyncPasscodeState.New:
                    // The user does not have any keys stored in KMS.  New keys will be
                    // created for them using the passcode entered by the user.
                    sparkComms.syncStart(SPARK_PASSWORD,
                        BBMEnterprise.SyncStartAction.New);
                    break;

                case BBMEnterprise.SyncPasscodeState.Existing:
                    // The user has existing keys stored in KMS.  To use the existing keys,
                    // start the sync with 'Existing'.  To create new keys for the user,
                    // start the sync with 'New'.
                    console.log("Spark Comms setup sync pass code state.");
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
            break;
    }
});

// Register to handle setupError events.
sparkComms.on('setupError', error => {
    console.log(`Endpoint setup failed: ${error.value}`);
});

exports.setupSpark = function () {
    // Start the SDK.
    sparkComms.setupStart();
}


//A chat was created
sparkComms.messenger.on('chatAdded', addedEvent => {
    console.log("Created a chat with ID " + addedEvent.chat.chatId + 
        " with state: " + addedEvent.chat.state);

    if (addedEvent.chat.state !== BBMEnterprise.Messenger.Chat.State.Defunct)
    {
        activeChatID = addedEvent.chat.chatId;
    }
});


//A chat was updated
sparkComms.messenger.on('chatUpdated', addedEvent => {
    console.log("Updated a chat with ID " + addedEvent.chat.chatId + 
        " with state: " + addedEvent.chat.state);

        if (addedEvent.chat.state === BBMEnterprise.Messenger.Chat.State.Ready)
        {
            //Chat is ready, store the active chat ID.
            console.log("Chat is ready.");
            activeChatID = addedEvent.chat.chatId;
        }
        else if (addedEvent.chat.state === BBMEnterprise.Messenger.Chat.State.Waiting)
        {
            console.log("Chat waiting to be restored.");
            sparkComms.messenger.fetchChatMessages(addedEvent.chat.chatId);

        }
        else if (addedEvent.chat.state === BBMEnterprise.Messenger.Chat.State.Restoring)
        {
            console.log("Chat is being restored.");
        }
        else if (addedEvent.chat.state === BBMEnterprise.Messenger.Chat.State.Defunct)
        {
            console.log("Chat is defunct. Leaving chat.");
            sparkComms.messenger.chatLeave(addedEvent.chat.chatId);
            activeChatID = "";
        }        
});


//Get the report chat if it exists.
async function setupReportChat()
{
    let chats = sparkComms.messenger.getChats();
    console.log("Chats retrieved: " + chats.length);  
}

//Is there an active chat available for sending messages?
exports.isReadyToSend = function()
{
    if (activeChatID.length > 0)
    {
        return true;
    }
    else
    {
        return false;
    }
}

//Send temperature reports.
exports.sendTemperatureReportMessage = function(reportJSON)
{
    //Esnure there is an active chat to send the reports.
    if (activeChatID.length > 0)
    {
        console.log("Sending report...");
        //Send the temperature reports.
        try
        {
            let messageContent = "Message created at: " + Date.now();
            sparkComms.messenger.chatMessageSend(activeChatID, {
            tag: 'Text',
            content: messageContent,
            data: reportJSON
        }).then(() => {
            console.info(`Successfully sent temperature report: ` + messageContent);
        }).catch((error) => {
            console.error(`Discarding record that could not be delivered to the infrastructure: ${error}`);
        });
        }
        catch(error)
        {
            console.error(`Discarding record that SDK refused to accept for sending: ${error}`);
        }     
    }
    else
    {
        console.log("No active chat available. Not sending report.");
        setupReportChat();
    }
}