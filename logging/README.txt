This folder contains various logging utility classes I’ve developed for projects over the years.  All are based on a simplified version of the Java log4j logging
library (https://logging.apache.org/log4j/1.x/manual.html), adapted for use in ServiceNow’s JavaScript environment. 

NOTE: Since all logs are queued up in memory, it is recommended to wrap their usage in a try/catch/finally block to guarantee all statements are logged to your
chosen destination in the event of an error.

-------------------
| xbufferedLogger |
-------------------

A typical use-case will look something like this:

//1. Create a new instance of the logger.
var logger = new xBufferedLogger();
try {

    //(Optional) You can change the level of the logger directly. (default is ERROR level).
    logger.setLogLevelInfo();

    //(Optional) Alternatively, you can initialize the logging level from a system property (must have a valid logging level value or an exception will be thrown).
    logger.setLogLevelBySysProperty("u.my_company.integration.log.level");

    //2. Write logs as needed.
    logger.info("My Info message here");
    logger.warn("My Warn message here");
    logger.error("My Error message here");
    logger.fatal("My Fatal message here");
    if (logger.isDebugLevelEnabled()) {
        logger.debug("My Debug message here");
    }

//prevent any unhandled exceptions from stopping the transform of other rows
} catch (ex) {
    logger.error("UNHANDLED EXCEPTION: '" + ex + "'!");

//3. Finally, once all operations are completed, call flush() to obtain the combined result as a
//single string that can be written to the system logs as a single unit (or captured elsewhere if desired).
} finally {
    gs.log(logger.flush(), “MySourceName”);
}                                                                   

                                                                                                                                                                        
--------------------
| xImportSetLogger |
--------------------

A typical use-case will look something like this (if running from an Import Set Transform Map script):

(function runTransformScript(source, map, target) {

	//1. Create a new instance of the logger.
	var log = new CFNImportSetLogger(source);
	try {

		if (log.isDebugLevelEnabled())
			log.debug("START onBefore script");
		log.info("Another log");

	//prevent any unhandled exceptions from stopping the transform of other rows
	} catch (ex) {
		log.error("UNHANDLED EXCEPTION in onBefore script: '" + ex + "'. Aborting processing of this row.");
		ignore = true;

	//Write all logs to the import log of the current import set row.
	} finally {
		if (log.isDebugLevelEnabled())
			log.debug("END onBefore script");
		log.logToImportRow();
	}

})(source, map, target);
