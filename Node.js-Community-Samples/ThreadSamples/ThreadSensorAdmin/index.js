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

require('marko/node-require').install();
var markoExpress = require('marko/express');

const express = require('express');
//var bodyParser = require("body-parser");
var dbConnector = require("./DBConnector.js");
var sparkComms = require("./SparkComms.js");

//The template pages.
var setupPage = require("./templates/setup.marko");
var chooseCollectorPage = require("./templates/chooseCollector.marko");
var errorPage = require("./templates/errorPage.marko");
var viewCollectorPage = require("./templates/viewCollector.marko");
var curveChartJSPage = require("./templates/curveChartJS.marko");
var curveChartBodyPage = require("./templates/curveChartBody.marko");

const app = express();
const port = 80;

init();

async function init()
{
    try
    {
            app.use(express.json());
            app.use(express.urlencoded({ extended: true }));
            app.use(markoExpress());

            await dbConnector.initDB();

            //Show the main page.
            app.get('/', async function(req, res){
                try
                {
                    //If a collector hasn't been chosen yet, display the page to choose one.
                    if (typeof req.query.collID === "undefined")
                    {
                        let collectors = await dbConnector.getCollectors();
                        var selectOptions = "";

                        if (collectors != null) {
                            collectors.forEach((row) => {
                                selectOptions += "<option value ='";
                                selectOptions += row.id;
                                selectOptions += "'>";
                                selectOptions += row.collectorID;
                                selectOptions += "\</option>\n";

                            });
                        }

                        res.marko(chooseCollectorPage, {selOptions: selectOptions});
                    }
                    else
                    {
                        //A collector has been chosen.

                        //Get the collector's friendly ID.
                        let collectorID = await dbConnector.getCollectorID(req.query.collID);

                        //Get all devices for the chosen collector.
                        let devices = await dbConnector.getDevicesForCollector(collectorID.collectorID);

                        let chartJS = "";
                        let chartBody = "";

                        //Sequential number to give each chart it's own unique ID on the final page.
                        let chartCount = 0;

                        //Create report output for each devices.
                        for (let deviceCount = 0; deviceCount < devices.length; deviceCount++)
                        {
                            let chartData = "['Timestamp', 'Temperature °C'],";

                            //Get the last 20 temperature reports.
                            let tempReports = await dbConnector.getTemperatureReportsForDevice(devices[deviceCount].deviceID, 20);
                            
                            for (let reportCount = 0; reportCount < tempReports.length; reportCount++)
                            {
                                chartData += "[new Date(" + tempReports[reportCount].reportTime + "), " + 
                                     tempReports[reportCount].temperature + "],";
                            }

                            //Trim the final trailing comma.
                            chartData = chartData.slice(0, chartData.length - 1);

                            chartJS += curveChartJSPage.renderToString({ chartDeviceID: devices[deviceCount].deviceID, 
                                chartNo : chartCount, chartDataValues : chartData });
                            chartBody += curveChartBodyPage.renderToString({ chartDeviceID: devices[deviceCount].deviceID });                            
                            chartCount++;
                        }

                        res.marko(viewCollectorPage, {chartJavaScript : chartJS, chartBodyContent : chartBody,
                        collectorID : collectorID.collectorID});
                    }
                }
                catch (err)
                {
                    console.log("Error showing collector graphs: " + err.toString());
                    res.marko(errorPage, {errorMessage : err.toString()});
                }
            });
 
            
            //Show the setup page.
            app.get('/setup', function(req, res){
                res.marko(setupPage, {});
            });

            //Store the new collector.
            app.post('/setup', async function(req, res){
                var retMessage = "";

                if (req.body.collectorID.length > 0 && req.body.sparkRegID.length > 0)
                {
                    try
                    {
                        await dbConnector.insertCollector(req.body.collectorID, req.body.sparkRegID);
                        retMessage = "Collector was added.";
                        sparkComms.createChat(req.body.sparkRegID);
                    }
                    catch (err)
                    {
                        retMessage = "Failed to add collector: " + err;
                    }
                }
                else
                {
                    retMessage = "Invalid collector or spark ID.";
                }
                
                res.marko(setupPage, {
                    message: retMessage
                });
            });    

            //Initialize the BlackBerry Spark Communication Service.
            sparkComms.setupSpark();

            app.listen(port, () => console.log(`Thread Sensor Admin listening on port ${port}!`));


    }
    catch (error)  //Catch errors creating or opening the database.
    {
        console.log("Failed to initialize database. Exiting.");
        process.exit([1]);
    }
}