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
        db = new sqlite3.Database('./db/temperatureAdmin.db', (err) => {
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
        let createTable = `
            CREATE TABLE IF NOT EXISTS TemperatureReports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collectorID TEXT,
            deviceID TEXT,            
            temperature REAL,
            reportTime INTEGER)`;
        
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
        createTable = `
            CREATE TABLE IF NOT EXISTS Collectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collectorID TEXT,
            sparkRegID TEXT NOT NULL UNIQUE)`;

        db.run(createTable, function(error) {
            //Error is null if this was successful.
            if (error != null)
            {
                console.log("Error creating Collectors: ", error.message);
                reject();
            }
            else
            {
                resolve();
            }
        });
    });

    return Promise.all([promise1, promise2, promise3]);
};

exports.insertCollector = function(collectorID, sparkRegID)
{
    let insertSQL = `
    INSERT INTO Collectors (collectorID, sparkRegID)
    VALUES (?, ?)`;

    let promise = new Promise((resolve, reject) => {
        db.run(insertSQL, [collectorID, sparkRegID], function(error) {
            //Error is null if this was successful.
            if (error != null)
            {
                console.log("Error inserting collector: ", error.message);
                reject();
            }
            else
            {
                resolve();
            }
        });
    });
    return promise;
}

//Insert a new temperature report.
exports.insertTemperatureReport = function(collectorID, deviceID, temperature, reportTime)
{
    let insertSQL = `
    INSERT INTO TemperatureReports (collectorID, deviceID, temperature, reportTime)
    VALUES (?, ?, ?, ?)`;

    db.run(insertSQL, [collectorID, deviceID, temperature, reportTime], function(error) {
        //Error is null if this was successful.
        if (error != null)
        {
            console.log("Error inserting temperature report: ", error.message);
        }
    });
}

//Return all collectors.
exports.getCollectors = function()
{
    let query = "SELECT * FROM Collectors;";

    let promise = new Promise((resolve, reject) => {
        db.all(query, [], (err, rows) => {
            if (err) {
                console.log("Failed to get collectors.");
                reject();
            }
                resolve(rows);
        });
    });
    return promise;
}

//Return a collector's name.
exports.getCollectorID = function(id)
{
    let query = "SELECT collectorID FROM Collectors WHERE id=?;";

    let promise = new Promise((resolve, reject) => {
        db.get(query, [id], (err, row) => {
            if (err) {
                console.log("Failed to get collectorID.");
                reject();
            }
                resolve(row);
        });
    });
    return promise;
}

//Return devices for a specific collector.
exports.getDevicesForCollector = function(collectorID)
{
    let query = "SELECT deviceID FROM TemperatureReports WHERE collectorID = ? GROUP BY deviceID;";

    let promise = new Promise((resolve, reject) => {
        db.all(query, [collectorID], (err, rows) => {
            if (err) {
                console.log("Failed to get devices.");
                reject();
            }
                resolve(rows);
        });
    });
    return promise;
}

//Return the most recent X number of temperature reports for a device.
exports.getTemperatureReportsForDevice = function(deviceID, limit)
{
    let query = "SELECT temperature, reportTime FROM TemperatureReports WHERE deviceID = ? ORDER BY reportTime DESC LIMIT ?;";

    let promise = new Promise((resolve, reject) => {
        db.all(query, [deviceID, limit], (err, rows) => {
            if (err) {
                console.log("Failed to get temperature reports.");
                reject();
            }
                resolve(rows);
        });
    });
    return promise;
}