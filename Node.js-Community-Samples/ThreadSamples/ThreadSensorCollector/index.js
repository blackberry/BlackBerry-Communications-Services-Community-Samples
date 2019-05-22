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

const express = require('express');
const app = express();
const port = 5445;
const TYPE_TEMPERATURE_REPORT = "tempReport";
var dbConnector = require("./DBConnector.js");
var sparkComms = require("./SparkComms.js");
var COLLECTOR_NAME = "Mark4-Collector";


init();

async function init()
{
    try
    {
        app.use(express.json());

        await dbConnector.initDB();

        //Listen for incoming temperature reports.
        app.post('/', function(req, res){

            saveData(req.body);

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end("{ \"GotIt\": \"true\" }");
        });

        //Initialize the BlackBerry Spark Communication Service.
        sparkComms.setupSpark();

        //Listen for incoming temperature reports.
        app.listen(port, () => console.log(`Thread Sensor Collector listening on port ${port}!`));

        //Schedule to send temperature reports per the configured reporting frequency.
        let reportFrequency = await dbConnector.getAdminReportFrequency();
        setTimeout(sendReports, reportFrequency.ParameterValue);
        console.log("sendReports scheduled to run in " + reportFrequency.ParameterValue + " milliseconds.")
    }
    catch (error)  //Catch errors creating or opening the database.
    {
        console.log("Failed to initialize database. Exiting. " + error.toString());
        process.exit([1]);
    }
}        

//Save the temperature report.
function saveData(body)
{
    console.log("ID: " + body.DeviceId + " Temp: " + body.Temperature);
    dbConnector.insertTemperature(body.DeviceId, body.Temperature);

}

//Report the collected temperature reports to the admin server.
async function sendReports()
{
    if (sparkComms.isReadyToSend())
    {

        //Get the temperature reports.
        let temperatureRows = await dbConnector.getTemperatureReports();

        //Ensure there are reports to send.
        if (temperatureRows != null && temperatureRows.length > 0)
        {
            let reportJSON = new Object();
            reportJSON.type = TYPE_TEMPERATURE_REPORT;
            reportJSON.collector = COLLECTOR_NAME;
            
            let reportRows = new Array(temperatureRows.length);
            let rowCount = 0;

            //Add each temperature report.
            temperatureRows.forEach((row) => {
                let tempObject = new Object();
                tempObject.deviceID = row.deviceID;
                tempObject.temperature = row.temperature;
                tempObject.reportTime = row.reportTime;

                reportRows[rowCount] = tempObject;
                rowCount++;
            });

            reportJSON.temperatureReports = reportRows;

            try
            {
                //Send the temperature report as JSON.
                await sparkComms.sendTemperatureReportMessage(reportJSON);

                //Delete the temperature rows that were sent.
                temperatureRows.forEach((row) => {
                    dbConnector.deleteTemperatureReport(row.id);            
                });
            }
            catch (error)
            {
                console.log("Failed to send temperature report: " + error.toString());
            }
        }
        else
        {
            console.log("No temperature reports to send.");
        }
    }
    else
    {
        console.log("No active chat available. Not sending report.");
    }

    //Schedule to send the next temperature report per the configured reporting frequency.
    let reportFrequency = await dbConnector.getAdminReportFrequency();
    setTimeout(sendReports, reportFrequency.ParameterValue);
    console.log("sendReports scheduled to re-run in " + reportFrequency.ParameterValue + " milliseconds.");
}