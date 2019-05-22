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

package com.msohm.blackberry.threadsensorcollectornode;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.text.Editable;
import android.util.Log;
import android.widget.Button;
import android.widget.EditText;

import com.google.android.things.contrib.driver.apa102.Apa102;
import com.google.android.things.contrib.driver.bmx280.Bmx280;
import com.google.android.things.contrib.driver.ht16k33.AlphanumericDisplay;
import com.google.android.things.contrib.driver.ht16k33.Ht16k33;
import com.google.android.things.contrib.driver.lowpan.UartLowpanDriver;
import com.google.android.things.contrib.driver.rainbowhat.RainbowHat;
import com.google.android.things.lowpan.LowpanBeaconInfo;
import com.google.android.things.lowpan.LowpanCredential;
import com.google.android.things.lowpan.LowpanException;
import com.google.android.things.lowpan.LowpanInterface;
import com.google.android.things.lowpan.LowpanManager;
import com.google.android.things.lowpan.LowpanProvisioningParams;
import com.google.android.things.lowpan.LowpanScanner;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.Collections;
import java.util.List;
import java.util.Random;


public class MainActivity extends Activity {

    private static final String TAG = MainActivity.class.getSimpleName();

    // UART parameters for the LoWPAN module
    private static final String UART_PORT = "USB1-1.3:1.0";
    private static final int UART_BAUD = 115200;

    //Details to connect to the ThreadSensorCollector over the Thread network
    private static final String SERVER_ADDRESS = "";
    private static final int SERVER_PORT = 5445;
    private static final String SERVER_END_POINT = "/";

    //ThreadOfThings network key:
    private static final String LOWPAN_KEY = "";
    private static final String LOWPAN_NETWORK = "";

    //Unique Identifier for each Android Thing Device Reporting Results
    private static final String THIS_DEVICE_ID = "Thing 1";

    private static final String PARAM_DEVICE_ID = "DeviceId";
    private static final String PARAM_TEMPERATURE = "Temperature";

    // Strings to display on the segment display
    private static final String DISPLAY_READY = "TNOK";
    private static final String DISPLAY_WAIT  = "....";
    private static final String DISPLAY_INIT =  "****";
    private static final String DISPLAY_ERROR = "ERR!";
    private static final String DISPLAY_EMPTY = "    ";
    private static final String DISPLAY_STOP = "STOP";

    private UartLowpanDriver mLowpanDriver;
    private LowpanManager mLowpanManager;
    private LowpanInterface mLowpanInterface;
    private LowpanScanner mLowpanScanner;

    private ConnectivityManager mConnectivityManager;
    private Network mNetwork;

    private Handler mUiThreadHandler;
    private EditText logEditText;
    private EditText serverIPAddressEditText;

    //Used to run the scheduled sensor capture.
    private static final int LOOP_INTERVAL_DELAY = 5000; //in milliseconds
    private int mCountdownFrom = 10;

    private Handler mSensorHandler;
    private HandlerThread mSensorHandlerThread;
    private boolean mReportingOn = false;
    //Used to randomize the temperature value to get different readings to report.
    private boolean mRandomizeTemperature = false;

    private AlphanumericDisplay mSegmentDisplay;


    @Override
    protected void onCreate(Bundle savedInstanceState)
    {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        logEditText = findViewById(R.id.logEditText);

        //Populate the server IP address edit text with the coded value.
        serverIPAddressEditText = findViewById(R.id.serverIPEditText);
        serverIPAddressEditText.setText(SERVER_ADDRESS);

        Button statusButton = findViewById(R.id.statusButton);
        statusButton.setOnClickListener((buttonView) -> lowpanctlStatus());

        Button ipAddressButton = findViewById(R.id.ipAddressButton);
        ipAddressButton.setOnClickListener((buttonView) -> showIPAddreses());

        mUiThreadHandler = new Handler(Looper.getMainLooper());

        mSensorHandlerThread = new HandlerThread("HandlerThread");
        mSensorHandlerThread.start();
        mSensorHandler = new Handler(mSensorHandlerThread.getLooper());

        try {
            //Open the segment display
            mSegmentDisplay = RainbowHat.openDisplay();
            mSegmentDisplay.setBrightness(Ht16k33.HT16K33_BRIGHTNESS_MAX);
            mSegmentDisplay.display(DISPLAY_INIT);
            mSegmentDisplay.setEnabled(true);

            //RainbowHat A and B buttons start and stop reporting.
            com.google.android.things.contrib.driver.button.Button buttonA = RainbowHat.openButtonA();
            buttonA.setOnButtonEventListener((button, pressed) -> startSensorReporting());

            com.google.android.things.contrib.driver.button.Button buttonB = RainbowHat.openButtonB();
            buttonB.setOnButtonEventListener((button, pressed) -> stopSensorReporting());

            //RainbowHat C button randomizes the temperature.
            com.google.android.things.contrib.driver.button.Button buttonC = RainbowHat.openButtonC();
            buttonC.setOnButtonEventListener((button, pressed) -> mRandomizeTemperature = true);

        } catch (IOException e) {
            Log.e(TAG, "Unable to initialize segment display", e);
        }


        mLowpanManager = LowpanManager.getInstance();
        try {
            mLowpanManager.registerCallback(mInterfaceCallback);
        } catch (LowpanException e) {
            Log.e(TAG, "Unable to attach LoWPAN callback", e);
        }

         // Initialize network
        resetNetwork();
        try {
            ensureLowpanInterface();
            performNetworkScan();
        } catch (LowpanException e) {
            logMessage("Cannot find Thread network: "+ e.toString());
        }
    }

    @Override
    protected void onStart() {
        super.onStart();

        // Register a LoWPAN module connected over UART
        try {
            mLowpanDriver = new UartLowpanDriver(UART_PORT, UART_BAUD);
            mLowpanDriver.register();
        } catch (IOException e) {
            logMessage("Unable to init LoWPAN driver.");
        }
    }

    @Override
    protected void onStop() {
        super.onStop();

        if (mLowpanDriver != null) {
            try {
                mLowpanDriver.close();
            } catch (IOException e) {
                Log.e(TAG, "Unable to close LoWPAN driver");
            } finally {
                mLowpanDriver = null;
            }
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();

        //Stop reporting sensor data.
        stopSensorReporting();

        // Disconnect from the network
        logMessage("Disconnected.");
        mConnectivityManager.unregisterNetworkCallback(mNetworkCallback);

        // Detach LoWPAN callbacks
        mLowpanManager.unregisterCallback(mInterfaceCallback);
        if (mLowpanScanner != null) {
            mLowpanScanner.stopNetScan();
            mLowpanScanner.setCallback(null);
            mLowpanScanner = null;
        }

        // Clear and close peripheral interfaces
        if (mSegmentDisplay != null) {
            try {
                mSegmentDisplay.display(DISPLAY_EMPTY);
                mSegmentDisplay.close();
            } catch (IOException e) {
                Log.e(TAG, "Cannot close segment display", e);
            } finally {
                mSegmentDisplay = null;
            }
        }

        //Turn off the LED strip.
        try
        {
            Apa102 ledstrip = RainbowHat.openLedStrip();
            ledstrip.setBrightness(1);
            int[] rainbow = new int[RainbowHat.LEDSTRIP_LENGTH];
            for (int i = 0; i < rainbow.length; i++) {
                rainbow[i] = Color.HSVToColor(1, new float[]{0, 0, 0});
            }
            ledstrip.write(rainbow);
            ledstrip.close();

        } catch (IOException ioex) {} //Ignore
    }

    /**
     * Initializes the network.
     */
    private void resetNetwork() {
        // Initialize network
        logMessage("Initializing LoWPAN.");
        mConnectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkRequest networkRequest = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_LOWPAN)
                .build();

        // Make sure that it is connected to a valid network
        mConnectivityManager.registerNetworkCallback(networkRequest,
                mNetworkCallback, mUiThreadHandler);
    }

    /**
     * Listen for a new LoWPAN device. This callback is invoked when
     * a LoWPAN module is connected and the user driver is registered.
     */
    private LowpanManager.Callback mInterfaceCallback = new LowpanManager.Callback() {
        @Override
        public void onInterfaceAdded(LowpanInterface lpInterface) {
            try {
                ensureLowpanInterface();
                performNetworkScan();
            } catch (LowpanException e) {
                onNewValue(DISPLAY_ERROR);
                logMessage("Could not join LoWPAN network: " + e.toString());
            }
        }

        @Override
        public void onInterfaceRemoved(LowpanInterface lpInterface) {
            logMessage("Removed: " + lpInterface.getName());
        }
    };

    /**
     * Callback invoked when the a new network interface appears.
     * This occurs after joining the LoWPAN network.
     */
    private ConnectivityManager.NetworkCallback mNetworkCallback =
            new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    if (mNetwork == null) {
                        logMessage("Got Network: " + network);
                        mNetwork = network;
                    }
                }
                @Override
                public void onLost(Network network) {
                    if (mNetwork == network) {
                        logMessage("Lost Network: " + network);
                        mNetwork = null;
                        logMessage("No network available (002).");
                    }
                }
            };

    /**
     * Verify that a LoWPAN interface is attached
     */
    private void ensureLowpanInterface() throws LowpanException {
        mLowpanInterface = mLowpanManager.getInterface();

        if (mLowpanInterface == null) {
            logMessage("No existing LoWPAN interface found.");
            throw new LowpanException("No existing LoWPAN interface found.");
        }

        mLowpanInterface.registerCallback(mStateCallback);
    }

    /**
     * Callback to react to state changes in the LoWPAN interface
     */
    private LowpanInterface.Callback mStateCallback = new LowpanInterface.Callback() {
        @Override
        public void onStateChanged(int state) {
            if (state == LowpanInterface.STATE_ATTACHED) {
                logMessage("Provisioned on a Thread network");
                onNewValue(DISPLAY_READY);
            }
        }

        @Override
        public void onProvisionException(Exception e) {
            logMessage("Could not provision network" + e.toString());
            onNewValue(DISPLAY_ERROR);
        }
    };

    /**
     * Begin a scan for LoWPAN networks nearby
     */
    private void performNetworkScan() throws LowpanException {
        if (mLowpanInterface == null) return;

        // Check if we are already provisioned on the right network
        LowpanProvisioningParams params = mLowpanInterface.getLowpanProvisioningParams(false);
        if (params != null && LOWPAN_NETWORK.equals(params.getLowpanIdentity().getName())) {
            logMessage("Attached to an existing Thread network.");
            return;
        }

        logMessage("Scanning for nearby networks");
        onNewValue(DISPLAY_WAIT);
        mLowpanScanner = mLowpanInterface.createScanner();
        mLowpanScanner.setCallback(mLowpanScannerCallback);
        mLowpanScanner.startNetScan();
    }

    /**
     * Callback to handle network scan results
     */
    private LowpanScanner.Callback mLowpanScannerCallback = new LowpanScanner.Callback() {
        @Override
        public void onNetScanBeacon(LowpanBeaconInfo beacon) {
            if (beacon.getLowpanIdentity().getName().equals(LOWPAN_NETWORK)) {
                joinNetwork(beacon);
            } else {
                Log.i(TAG, "Found network " + beacon.getLowpanIdentity().getName());
            }
        }

        @Override
        public void onScanFinished() {
            Log.i(TAG, "LoWPAN scan complete");
        }
    };

    /**
     * Attempt to join the Thread network
     */
    private void joinNetwork(LowpanBeaconInfo beacon) {
        logMessage("Joining Thread network: " + beacon.getLowpanIdentity().getName());
        LowpanProvisioningParams params = new LowpanProvisioningParams.Builder()
                .setLowpanIdentity(beacon.getLowpanIdentity())
                .setLowpanCredential(LowpanCredential.createMasterKey(LOWPAN_KEY))
                .build();

        try {
            mLowpanInterface.join(params);
        } catch (LowpanException e) {
            logMessage("Unable to join Thread network " + e.toString());
        }
    }

    /**
     * Update the Rainbow HAT segment display
     */
    private void onNewValue(String value) {
        mUiThreadHandler.post(() -> {
            try {
                mSegmentDisplay.display(value);
            } catch (IOException e) {
                logMessage("Unable to send to segment display " + value + e.toString());
            }
        });
    }

    private void logMessage(String message)
    {
        mUiThreadHandler.post(() -> {
            Editable loggedText = logEditText.getText();

            //Avoid having too much logged data in the EditText
            if (loggedText.length() > 10000)
            {
                //Remove the first half of log messages.
                loggedText.delete(0, 5000);
            }

            loggedText.append(message + '\n');
            logEditText.setText(loggedText);
            logEditText.setSelection(logEditText.getText().length());
            Log.i(TAG, message);
        });
    }

    /**
     * Runs lowpanctl status and logs the output.
     */
    private void lowpanctlStatus()
    {
        try {
            Process process = Runtime.getRuntime().exec("lowpanctl status");
            InputStreamReader isReader = new InputStreamReader(process.getInputStream());
            BufferedReader bufferedReader = new BufferedReader(isReader);

            int numRead;
            char[] buffer = new char[512];
            StringBuffer lowpanctlOutput = new StringBuffer();

            while ((numRead = bufferedReader.read(buffer)) > 0)
            {
                lowpanctlOutput.append(buffer, 0, numRead);
            }
            bufferedReader.close();
            process.waitFor();

            logMessage(lowpanctlOutput.toString());
        } catch (Exception e) {
            logMessage("Failed to run lowpanctl status." + e.toString());
        }
    }

    /**
     * Shows the devices IP Addresses.
     */
    private void showIPAddreses()
    {
        try
        {
            StringBuffer ips = new StringBuffer();

            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            for (NetworkInterface intface : interfaces)
            {
                List<InetAddress> addresses = Collections.list(intface.getInetAddresses());
                for (InetAddress address : addresses)
                {
                    if (!address.isLoopbackAddress())
                    {
                        ips.append(address.getHostAddress());
                        ips.append("\n");
                    }
                }
            }

            logMessage(ips.toString());
        } catch (Exception ex)
        {
            logMessage("Exception getting IP Addresses: " + ex.toString());
        }
    }

    /**
     * Task to connect to a receiver device on the LoWPAN network
     */
    private Runnable mSensorReporterRunnable = new Runnable() {
        @Override
        public void run() {

            try
            {

                doCountdown();
                activateAnamorphicEqualizer();
                int temp = (int)getTemperature();
                //logMessage("Temp: " + temp);
                mSegmentDisplay.display(temp + " C");
                sendTemperature(temp);

            } catch (Exception ex) {
                logMessage("Exception in mSensorReporterRunnable: " + ex.toString());
            } finally {
                //Reschedule this Runnable to run again.
                if (mReportingOn) {
                    mSensorHandler.postDelayed(mSensorReporterRunnable, LOOP_INTERVAL_DELAY);
                }
            }
        }
    };

    /**
     *  Displays a countdown timer on the Rainbow Hat, also delays that long.
     */
    private void doCountdown()
    {
        try
        {
            //Do a countdown to give a visual that something is happening..
            for (int countDown = mCountdownFrom; countDown > 0; countDown--)
            {
                mSegmentDisplay.display(countDown);
                Thread.sleep(1000);
            }

            mSegmentDisplay.display(DISPLAY_EMPTY);
        } catch (Exception ex) {
            logMessage("Countdown failed: " + ex.toString());
        }
    }

    /**
     *  Scan like K.I.T.T.  This method is pure special effects of lighting up the LED strip.
     */
    private void activateAnamorphicEqualizer()
    {
        Apa102 ledStrip = null;
        try
        {
            // Light up the rainbow like K.I.T.T.
            ledStrip = RainbowHat.openLedStrip();
            ledStrip.setBrightness(1);
            int[] rainbow = new int[RainbowHat.LEDSTRIP_LENGTH];

            //Go right to left.
            for (int ledCount = rainbow.length - 1; ledCount >= 0; ledCount--)
            {
                for (int i = 0; i < rainbow.length; i++) {
                    if (i == ledCount) {
                        rainbow[i] = Color.HSVToColor(255, new float[]{1.0f, 1, 1});
                    }
                    else
                    {
                        rainbow[i] = Color.HSVToColor(255, new float[]{0, 0, 0});
                    }
                }
                ledStrip.write(rainbow);
                Thread.sleep(100);
            }

            //Go left to right.
            for (int ledCount = 0; ledCount < rainbow.length + 1; ledCount++)
            {
                for (int i = 0; i < rainbow.length; i++) {
                    if (i == ledCount) {
                        rainbow[i] = Color.HSVToColor(255, new float[]{1.0f, 1, 1});
                    }
                    else
                    {
                        rainbow[i] = Color.HSVToColor(255, new float[]{0, 0, 0});
                    }
                }
                ledStrip.write(rainbow);
                Thread.sleep(100);
            }

        } catch (Exception ex) {
            logMessage("Failed to activate Anamorphic Equalizer: " + ex.toString());
        } finally {
            //Close the LED strip
            if (ledStrip != null) {
                try {
                    ledStrip.close();
                }
                catch (IOException ioex) {} //Ignore
            }
        }
    }

    /**
     *  Read the temperature from the Rainbow Hat.
     */
    private float getTemperature()
    {
        Bmx280 sensor = null;
        float temp = 0f;
        try
        {
            //Get the current temperature
            sensor = RainbowHat.openSensor();
            sensor.setTemperatureOversampling(Bmx280.OVERSAMPLING_1X);
            temp = sensor.readTemperature();

            //If the C button was pressed, randomize the next temperature a bit to report back
            // varying temperatures.
            if (mRandomizeTemperature)
            {
                mRandomizeTemperature = false;
                Random rand = new Random();

                //Add or remove from the temperature, randomly.
                if (rand.nextBoolean())
                {
                    temp += temp * rand.nextFloat();
                }
                else
                {
                    temp -= temp * rand.nextFloat();
                }
            }

        } catch (Exception ex) {
            logMessage("Failed to get temperature: " + ex.toString());
        } finally {
            //Close the sensor
            if (sensor != null) {
                try {
                    sensor.close();
                }
                catch (IOException ioex) {} //Ignore
            }
        }

        return temp;
    }

    private void sendTemperature(int temp)  {
        HttpURLConnection httpConn = null;
        InputStream ins = null;
        try {
            StringBuffer result = new StringBuffer();

            JSONObject temperatureReport = new JSONObject();
            temperatureReport.put(PARAM_DEVICE_ID, THIS_DEVICE_ID);
            temperatureReport.put(PARAM_TEMPERATURE, temp);

            URL url = new URL("http://[" + serverIPAddressEditText.getText() +
                    "]:" + SERVER_PORT + SERVER_END_POINT);

            httpConn = (HttpURLConnection) mNetwork.openConnection(url);
            httpConn.setConnectTimeout(5000);  //Set the timeout to 5 seconds.
            httpConn.setRequestMethod("POST");
            httpConn.setRequestProperty("Content-Type", "application/json;charset=UTF-8");
            httpConn.setRequestProperty("Accept","application/json");
            httpConn.setDoInput(true);
            httpConn.setDoOutput(true);
            httpConn.connect();

            // Send JSON temperature as POST.
            DataOutputStream printout = new DataOutputStream(httpConn.getOutputStream ());
            printout.writeBytes(temperatureReport.toString());
            printout.flush ();
            printout.close ();

            int resCode = httpConn.getResponseCode();

            if (resCode == 200) {
                ins = new BufferedInputStream(httpConn.getInputStream());
                if (ins != null) {
                    BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(ins));
                    String line = "";

                    while ((line = bufferedReader.readLine()) != null)
                        result.append(line);
                }
                ins.close();
            } else {
                logMessage("Response code was: " + resCode);
                mSegmentDisplay.display(resCode);
            }

            logMessage("HTTP Reply: " + result.toString());
        } catch (Exception ex) {
            logMessage("Exception sending temperature: " + ex.toString());

            try {
                mSegmentDisplay.display(DISPLAY_ERROR);
            }
            catch (IOException ioex) {} //Ignore this exception.

        } finally {

            if (httpConn != null) {
                httpConn.disconnect();
            }
        }
    }

    //Start looping recording of sensor data.
    void startSensorReporting() {
        //Ensure we don't start multiple reporting instances.
        if (!mReportingOn) {
            logMessage("Starting sensor reporting.");
            mReportingOn = true;
            mSensorHandler.post(mSensorReporterRunnable);
        }
    }

    //Stop looping recording of sensor data.
    void stopSensorReporting() {
        //Ignore multiple button presses.
        if (mReportingOn) {
            logMessage("Stopping sensor reporting.");
            mReportingOn = false;
            mSensorHandler.removeCallbacks(mSensorReporterRunnable);

            try
            {
                mSegmentDisplay.display(DISPLAY_STOP);
            }
            catch (IOException ioex) {} //Ignore this exception.
        }
    }
}