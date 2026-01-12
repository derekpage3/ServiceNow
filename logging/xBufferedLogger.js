/**
* @Author: github.com/derekpage3
* @Date: 06/16/2018
*
* This class implements a buffered logger utility.  It provides a simplied logging API with differing log levels, based
* on the Java log4j library; however, instead of immediately being written to the system logs, logged statements are
* held in memory until an explicit flush() call is made which returns the entirety of logged statements as a single
* string.  The typical use case is for scenarios where a log needs to be built on a transactional basis and then
* written only at the end.
*
* WARNING: BE CAREFUL HOW YOU USE THIS.  Because all logged content stays in memory, you could easily consume all the
* memory and crash the instance node if you log too much at once.  Make sure you understand the upper bound on how much
* your calling code might log before using it.
*
* Copyright 2026 github.com/derekpage3
*
* Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
* documentation files (the “Software”), to deal in the Software without restriction, including without limitation the
* rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
* permit persons to whom the Software is furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
* WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
* COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
* OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
var xBufferedLogger = Class.create();
xBufferedLogger.prototype = {

    //array of log statements to be logged.
    stmtQueue: null,

    //logging level.
    currentLevel: null,

    //separator char to use when outputting logs. defaults to \n, but can be overridden if the scenario
    //requires it (ex. changing it to a <br /> for HTML based reports).
    _separatorChar: '\n',

    /**
     * Initializes a new buffered logger.  The log queue is set to an empty array and the log level defaulted
	 * to ERROR level.
     */
    initialize: function() {

        //default to ERROR level on creation. Caller can change if needed.
        this.setLogLevelError();

        //init statement queue
        this.stmtQueue = [];
    },


    ///////////////////////////////////////////// PUBLIC LOGGING API /////////////////////////////////////////////
    //                                                                                                          //
    // Log writing methods.                                                                                     //
    //                                                                                                          //
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////

	/**
	 * Write a DEBUG level log to the queue.
	 */
    debug: function(message) {
        this._doLog(message, xBufferedLogger.LOG_LEVEL.DEBUG);
    },

	/**
	 * Write a INFO level log to the queue.
	 */
    info: function(message) {
        this._doLog(message, xBufferedLogger.LOG_LEVEL.INFO);
    },

	/**
	 * Write a WARN level log to the queue.
	 */
    warn: function(message) {
        this._doLog(message, xBufferedLogger.LOG_LEVEL.WARN);
    },

	/**
	 * Write a ERROR level log to the queue.
	 */
    error: function(message) {
        this._doLog(message, xBufferedLogger.LOG_LEVEL.ERROR);
    },

	/**
	 * Write a FATAL level log to the queue.
	 */
    fatal: function(message) {
        this._doLog(message, xBufferedLogger.LOG_LEVEL.FATAL);
    },

	/**
	 * Setter method for separator character.
	 */
    setSeparatorChar: function(val) {
        this._separatorChar = ("" + val); //ensure string
    },
	/**
	 * Getter method for separator character.
	 */
    getSeparatorChar: function() {
        return this._separatorChar;
    },

    /**
     * @return {string} joined string (joined by the configured separator char) of all logs in the queue.
     * 
     * Builds a string of all queued up log statements, clears the log queue and returns the final results.
     */
    flush: function() {

        //write to the debug log
        try {

            //return an Array.join() with newlines between.
            return this.stmtQueue.join(this.getSeparatorChar());

        } catch (err) {

            //logging should never throw exceptions that might cause otherwise valid program execution to stop.
            //This really should never happen except for maybe if an object was passed in that's a Java object
            //that doesn't implement toString(). which would cause the string concatention to throw an exception.
            //In that unlikely event, prevent logging problems from terminating the program.
        } finally {

            //always clear the stmt queue after logging it.
            this._clearStmtQueue();
        }
    },

    ////////////////////////////////////////////// LOG LEVEL SETTERS /////////////////////////////////////////////
    //                                                                                                          //
    // Methods for modifying the logging level of the logger.                                                   //
    //                                                                                                          //
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////

    setLogLevelDebug: function() {
        this.setLogLevel(xBufferedLogger.LOG_LEVEL.DEBUG.value);
    },

    setLogLevelInfo: function() {
        this.setLogLevel(xBufferedLogger.LOG_LEVEL.INFO.value);
    },

    setLogLevelWarn: function() {
        this.setLogLevel(xBufferedLogger.LOG_LEVEL.WARN.value);
    },

    setLogLevelError: function() {
        this.setLogLevel(xBufferedLogger.LOG_LEVEL.ERROR.value);
    },

    setLogLevelFatal: function() {
        this.setLogLevel(xBufferedLogger.LOG_LEVEL.FATAL.value);
    },

	/**
     * Allows for manually setting the logger level value
	 * 
	 * WARNING: The provided log level value MUST be one of the levels defined in the xBufferedLogger.LOG_LEVEL enum.
	 * Any other value provided will result in an exception.
     */
    setLogLevel: function(logLevelVal) {
        if (logLevelVal == null || logLevelVal == undefined)
            throw "xBufferedLogger.setLogLevel: xBufferedLogger: must specify log level upon creation!";

        //clear any previously set log level
        this.currentLevel = null;

        //Ensure specified level is valid
        for (var i in xBufferedLogger.LOG_LEVEL) {
            if (logLevelVal == xBufferedLogger.LOG_LEVEL[i].value) {
                this.currentLevel = xBufferedLogger.LOG_LEVEL[i];
                break;
            }
        }
        if (this.currentLevel == null)
            throw "xBufferedLogger: Invalid log level '" + logLevelVal + "' specified";
    },

	/**
	 * @param {string} propertyName - the name (including prefix if applicable) of the system property to configure the log level from.
	 * @return {void}
	 * 
	 * This method allows for setting the logger's log level via a specified system property's value.
	 * 
	 * WARNING: If the specified system property doesn't exist, is blank, or has an invalid value, this method will throw an exception. Take
	 * care to ensure your system property always has a correct value set when using this method.
	 */
	setLogLevelBySysProperty: function(propertyName) {
		if (gs.nil(propertyName))
			throw "xBufferedLogger.setLogLevelBySysProperty: parameter 'propertyName' is required!";
		propertyName = ((typeof propertyName) == 'string') ? propertyName : ("" + propertyName);  //ensure string.

		//Get value of the specified system property name
		var propVal = gs.getProperty(propertyName, "");
		if (gs.nil(propVal))
			throw "xBufferedLogger.setLogLevelBySysProperty: System property '" + propertyName + "' is either not set or doesn't exist!";

		//If not an integer then property's value is not a valid log level.
		var propValInt = parseInt(propVal);
		if (isNaN(propValInt))
			throw "xBufferedLogger.setLogLevelBySysProperty: System property '" + propertyName + "' value is '" + propVal 
				+ "' is not an integer and therefore is not a valid log level!";

		//Attempt setting to specified log level.
		try {
			this.setLogLevel(propValInt);
		
		//If the call to setLogLevel errors then the configured system property value isn't a valid logging level.
		} catch (ex) {
			throw "xBufferedLogger.setLogLevelBySysProperty: System property '" + propertyName + "' value is '" + propVal 
				+ "', which is not a valid log level (must be an integer)!";
		}
	},

    ////////////////////////////////////////////// LOG LEVEL GETTERS /////////////////////////////////////////////
    //                                                                                                          //
    // Methods for querying if the current level of the logger is at or below a specified level.  Can be used   //
    // by code to only do certain levels of logging if that level is enabled (mainly useful for skipping        //
    // calculations and string building done for debug logs if debug logging is not enabled).                   //
    //                                                                                                          //
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////

    isDebugLevelEnabled: function() {
        return (this.currentLevel.value <= xBufferedLogger.LOG_LEVEL.DEBUG.value);
    },

    isInfoLevelEnabled: function() {
        return (this.currentLevel.value <= xBufferedLogger.LOG_LEVEL.INFO.value);
    },

    isWarnLevelEnabled: function() {
        return (this.currentLevel.value <= xBufferedLogger.LOG_LEVEL.WARN.value);
    },

    isErrorLevelEnabled: function() {
        return (this.currentLevel.value <= xBufferedLogger.LOG_LEVEL.ERROR.value);
    },

    isFatalLevelEnabled: function() {
        return (this.currentLevel.value <= xBufferedLogger.LOG_LEVEL.FATAL.value);
    },


    //////////////// INTERNAL FUNCTIONS /////////////////

    _doLog: function(message, level) {

        //if intended log message's level is less than the current level, then discard this message.
        if (this.currentLevel.value > level.value) {
            return;
        }

        //Add statement to queue, prepending with Level display value.
        this.stmtQueue.push(level.label + ": " + message);
    },

    _clearStmtQueue: function() {

        //setting a new array into stmtQueue will effectively clear it.
        this.stmtQueue = [];
    },

    version: "20240519",

    type: 'xBufferedLogger'
};

/**
 * This enum defines the logging levels supported by this class.
 * Based off the values in the log4j 1.2 implementation.
 */
xBufferedLogger.LOG_LEVEL = {};
xBufferedLogger.LOG_LEVEL.DEBUG = {value: 10000, label: "[DEBUG]"};
xBufferedLogger.LOG_LEVEL.INFO = {value: 20000, label: "[INFO]"};
xBufferedLogger.LOG_LEVEL.WARN = {value: 30000, label: "[WARN]"};
xBufferedLogger.LOG_LEVEL.ERROR = {value: 40000, label: "[ERROR]"};
xBufferedLogger.LOG_LEVEL.FATAL = {value: 50000, label: "[FATAL]"};
