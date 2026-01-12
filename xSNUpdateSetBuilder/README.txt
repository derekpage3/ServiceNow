@Author: github.com/derekpage3
@Date: 07/06/2020

Utility class for programmatically building update sets with specified objects.  The original use case for this was building a new update set to migrate a large application to a new ServiceNow environment, because the application was large and there were simply too many existing Update Sets to find and batch together to generate one with the entirety of the application's objects.  There may be other uses for this and so it is provided for anyone who may find it useful.

It utilizes the out of box GlideUpdateManager2 and GlideUpdateSet classes to perform the building of the update set and capture of specified objects; however it provides the user with a higher level API for this purpose, abstracting away the complications of capturing certain multi-faceted objects (especially Tables) where the user would otherwise have to explicitly code out the capture of multiple hierarchical layers of related objects, or capture multiple related objects whose relationships aren't immediately obvious.  The class provides the framework for capturing needed objects, but it's up to the user to ensure they capture all the necessary components (apart from objects that have specific methods to capture all related objects, such as Tables) to reproduce entirely the application or functionality desired.  Scripts written against this class don't immediately capture updates to a new update set, but instead queue them up and only attempts to write them to an update set when the writeUpdateSet() function is called.  This allows for iterative development and testing, and only writing an update set once you're confident you've captured all the necessary items.
 
A typical use-case will look something like this:

//1. Create new builder object.
var util = new xUpdateSetBuilder();

//2. Make one or more API calls to capture necessary objects.
util.captureTableWithRelatedRecords("incident");
util.captureScriptIncludeByName("MyScriptInclude");
util.captureApplicationMenuAndModules("12345fbc0fa10300e608b36be10ABCDEF");
.
.
.

//3. Finally, call writeUpdateSet() to write all captured objects to an update set.
util.writeUpdateSet("My New Update Set");

Current object types not supported (as of 1.0.0)
-----------------------------------------------------------
    
• Notifications
• Workflows
• Anything related to Mobile (including mobile menus)
• Anything related to Service Portal
• Anything related to Workspaces.
