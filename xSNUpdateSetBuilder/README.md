This utility class allows for programmatically building update sets that capture desired objects.  The typical use case for this is building a new update set to migrate a large application to a new environment, when said application is large and there are simply too many existing Update Sets to find and batch together to generate one with the entirety of the application's objects.  It can also be used to manually generate new update sets for other scenarios.

It utilizes the the out-of-box GlideUpdateManager2 and GlideUpdateSet classes to perform the building of the update set and capture of specified objects; however it provides the user with a higher level API for this purpose, abstracting away the complications of capturing certain multi-faceted objects (especially Tables) where the user would otherwise have to explicitly code out the capture of multiple hierarchical layers of related objects, or capture multiple related objects whose relationships aren't immediately obvious.  This class provides the framework for capturing needed objects, but it's up to the user to ensure they capture all the necessary components (apart from objects that have specific methods to capture all related objects) to reproduce entirely the application or functionality desired.  

NOTE: Rather than capturing each object immediately as you call the various capture functions, this utility only adds them to a queue of updates to be captured and will only attempt to write them to an update set when the writeUpdateSet() function is called.  This allows you to test your script before actually building an update set for migration.

A typical use-case will follow this general pattern:

//1. Create new builder object.
var util = new global.xSNUpdateSetBuilder();

//2. Make one or more API calls to capture necessary objects.
util.captureTableWithRelatedRecords("incident");
util.captureScriptIncludeByName("MyScriptInclude");
util.captureApplicationMenuAndModules("12345fbc0fa10300e608b36be10ABCDEF");
.
.
.

//3. Finally, call writeUpdateSet() to generate an Update Set with the specified name and write all captured objects to it.
util.writeUpdateSet("My New Update Set");

Two versions are added to this folder:
1. The raw .js file for direct import into a code editor
2. an XML export of the Script Include which can be imported directly into a ServiceNow instance.
