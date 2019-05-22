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

const sqlite3 = require('sqlite3').verbose();
const PARAM_ADMIN_REPORT_FREQUENCY = "AdminReportFrequency";


var db;

//Create database and tables if they don't exist.
exports.initDB = function() {

    //Ensure the db directory exists.
    var fs = require('fs');
    var dir = './db';    
    if (!fs.existsSync(dir))
    {
        fs.mkdirSync(dir);
        console.log("db directory created.");
    }

    let promise1 = new Promise((resolve, reject) => {
        //Open the database.
        db = new sqlite3.Database('./db/temperatureReports.db', (err) => {
            if (err != null) {
                console.error("DB Connection error: " + err.message);
                reject();
            }
            else
            {
                console.log('Connected to the database.');
                resolve();
            }
        });
    });

    let promise2 = new Promise((resolve, reject) => {
        const createTable = `
        CREATE TABLE IF NOT EXISTS TemperatureReports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deviceID TEXT,
        temperature REAL,
        reportTime integer(4) not null default (strftime('%s','now')))`;
        
        db.run(createTable, function(error) {
            //Error is null if this was successful.
            if (error != null)
            {
                console.log("Error creating TemperatureReports: ", error.message);
                reject();
            }
            else
            {
                resolve();
            }
        });
    });

    let promise3 = new Promise((resolve, reject) => {
        const createTable = `
        CREATE TABLE IF NOT EXISTS ConfigParameters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ParameterName TEXT UNIQUE,
        ParameterValue TEXT)`;
        
        db.run(createTable, function(error) {
            //Error is null if this was successful.
            if (error != null)
            {
                console.log("Error creating ConfigParameters: ", error.message);
                reject();
            }
            else
            {
                resolve();
            }
        });
    });  
    
    //Ensure there is a default parameter value.
    let promise4 = new Promise((resolve, reject) => {
        let query = "SELECT Count(*) as count FROM ConfigParameters WHERE ParameterName = ?;"

        db.get(query, [PARAM_ADMIN_REPORT_FREQUENCY], (err, row) => {
            if (err) {
                console.log("Failed to get collectors");
                reject();
            }

            if (row.count == 0)
            {
                //Default PARAM_ADMIN_REPORT_FREQUENCY doesn't exist, add it as 20,000 milliseconds.
                const insertParam = `
                INSERT INTO ConfigParameters (ParameterName, ParameterValue)
                VALUES (?, ?)`;
            
                db.run(insertParam, [PARAM_ADMIN_REPORT_FREQUENCY, 20000], function(error) {
                    //Error is null if this was successful.
                    if (error != null)
                    {
                        console.log("Error inserting default parameter: ", error.message);
                        reject();
                    }
                });
                resolve();
            }
            else
            {
                //The PARAM_ADMIN_REPORT_FREQUENCY already exists.
                resolve();
            }
        });

    });       

    return Promise.all([promise1, promise2, promise3, promise4]);
};

//Insert a new temperature value.
exports.insertTemperature = function(deviceID, temperature)
{
    const insertTemp = `
    INSERT INTO TemperatureReports (deviceID, temperature)
    VALUES (?, ?)`;

    db.run(insertTemp, [deviceID, temperature], function(error) {
        //Error is null if this was successful.
        if (error != null)
        {
            console.log("Error inserting temperature report: ", error.message);
        }
    });
}

//Return the PARAM_ADMIN_REPORT_FREQUENCY.
exports.getAdminReportFrequency = function()
{
    let query = "SELECT ParameterValue FROM ConfigParameters WHERE ParameterName = ?;"

    let promise = new Promise((resolve, reject) => {
        db.get(query, [PARAM_ADMIN_REPORT_FREQUENCY], (err, row) => {
            if (err) {
                console.log("Failed to get collectors");
                resolve(null);
            }
                resolve(row);
        });
    });
    return promise;
}

//Return all stored temperature reports.
exports.getTemperatureReports = function()
{

    //Arbitrarily limiting to send 200 reports at a time for a better demo experience.
    //Adjust as required for your use case.
    let query = "SELECT * FROM TemperatureReports LIMIT 200;"

    let promise = new Promise((resolve, reject) => {
        db.all(query, [], (err, rows) => {
            if (err) {
                console.log("Failed to get temperature reports");
                resolve(null);
            }
                resolve(rows);
        });
    });
    return promise;
}

//Deletes a temperature report.
exports.deleteTemperatureReport = function(id)
{
    let query = "DELETE FROM TemperatureReports WHERE id = ?;"

    let promise = new Promise((resolve, reject) => {
        db.run(query, [id], (err, row) => {
            if (err) {
                console.log("Failed to get temperature reports");
                resolve(null);
            }
                resolve(null);
        });
    });
    return promise;
}