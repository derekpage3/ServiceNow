/**
 * Utility class for programmatically building update sets that capture specified objects.  The typical use case for
 * this is building a new update set to migrate a large application to a new environment, when said application is
 * large and there are simply too many existing Update Sets to find and batch together to generate one with the
 * entirety of the application's objects.  It can also be used to manually generate new update sets for other scenarios.
 *
 * It utilizes the the out-of-box GlideUpdateManager2 and GlideUpdateSet classes to perform the building of the update
 * set and capture of specified objects; however it provides the user with a higher level API for this purpose, 
 * abstracting away the complications of capturing certain multi-faceted objects (especially Tables) where the user 
 * would otherwise have to explicitly code out the capture of multiple hierarchical layers of related objects, or 
 * capture multiple related objects whose relationships aren't immediately obvious.  This class provides the framework
 * for capturing needed objects, but it's up to the user to ensure they capture all the necessary components (apart 
 * from objects that have specific methods to capture all related objects) to reproduce entirely the application or
 * functionality desired.  
 *
 * NOTE: Rather than capturing each object immediately as you call the various capture functions, this utility only 
 * adds them to a queue of updates to be captured and will only attempt to write them to an update set when the
 * writeUpdateSet() function is called.  This allows you to test your script before actually building an update set 
 * for migration.
 *
 * A typical use-case will follow this general pattern:
 *
 * //1. Create new builder object.
 * var util = new global.xSNUpdateSetBuilder();
 *
 * //2. Make one or more API calls to capture necessary objects.
 * util.captureTableWithRelatedRecords("incident");
 * util.captureScriptIncludeByName("MyScriptInclude");
 * util.captureApplicationMenuAndModules("12345fbc0fa10300e608b36be10ABCDEF");
 * .
 * .
 * .
 *
 * //3. Finally, call writeUpdateSet() to generate an Update Set with the specified name and write all captured objects to it.
 * util.writeUpdateSet("My New Update Set");
 *
 * Current object types not supported (as of version 2024.4.20)
 * -----------------------------------------------------------
 *
 * Notifications
 * Workflows
 * Anything related to Mobile (including mobile menus)
 * Anything related to Service Portal
 *
 * Copyright 2024 derekpage3@gmail.com
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the “Software”), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
 * to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions
 * of the Software.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
 * THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */
var xSNUpdateSetBuilder = Class.create();
xSNUpdateSetBuilder.prototype = {
	
	_um: null,  //GlideUpdateManager2 used for capturing objects.	
	_capturedObjectMap: null,  //map of all captured objects to be added to update set.
	_capturedObjectCount: null,  //count of captured objects
	
	/**
	 * @constructor
	 */
	initialize: function() {		
		this._capturedObjectMap = {};
		this._capturedObjectCount = 0;
		this._um = new GlideUpdateManager2();
    },
	
	///////////////////////////////////////////////// PUBLIC API /////////////////////////////////////////////////
	//                                                                                                          //
	// Core API functions for capturing various object types to an update set.                                  //
	//                                                                                                          //
	//////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	/**
	* @param {string} updateSetName - name of Update Set (in the current scope) to write captured updates to.
	* @return {void}
	* 
	* This function will write any previously captured objects to the specified update set.  If the named update
	* set already exists in the current scope, it will re-use it; otherwise, it will create a new one with that name.
	* NOTE:  This function call must move the currently logged in user to the specified update set for the captured 
	* objects to be written to it; it will ALWAYS move the current user back to their originally selected update set
	* once completed, so the user should see no ill-effects.	
	*/
	writeUpdateSet: function(updateSetName) {
		if (JSUtil.nil(updateSetName))
			throw "xSNUpdateSetBuilder.writeUpdateSet: parameter 'updateSetName' is nil!";
		
		//Ensure current scope is accessible.
		var currentScopepGR = this._getCurrentScopeGR();
		var currentScopeSysId = "" + currentScopepGR.sys_id;
		gs.log("writeUpdateSet: Called to write captured objects to [UPDATE SET: '" + updateSetName 
			+ "', SCOPE: '" + currentScopepGR.name + "']");
		
		//Capture current user's selected update set to revert to at the end.
		var gus = new GlideUpdateSet();
		var currUpdateSetSysId = gus.get();
		var currUpdateSetGR = new GlideRecord(xSNUpdateSetBuilder._TABLES.UPDATE_SET);
		if (!currUpdateSetGR.get(currUpdateSetSysId))
			throw "xSNUpdateSetBuilder.writeUpdateSet: Unable to retrieve GR for current update set!";
		gs.log("writeUpdateSet: User's current update set is '" + currUpdateSetGR.name + "'");
		
		//Find update set; create if it doesn't exist.
		var usGR = new GlideRecord(xSNUpdateSetBuilder._TABLES.UPDATE_SET);
		usGR.addQuery("application", currentScopeSysId);
		usGR.addQuery("name", updateSetName);
		usGR.query();
		if (!usGR.next()) {
			usGR = new GlideRecord(xSNUpdateSetBuilder._TABLES.UPDATE_SET);
			usGR.initialize();
			usGR.application = currentScopeSysId;
			usGR.name = updateSetName;
			usGR.insert();
			gs.log("writeUpdateSet: CREATED new update set named '" + usGR.name + "'");
		} else {
			gs.log("writeUpdateSet: EXISTING update set named '" + usGR.name + "' found.");
		}
		
		//Change to the specified update set, capture all the objects in it, and then
		//return the current user back to their originally selected update set.
		try {
			//Set current update set to indicated update set for write.
			var writeUpdateSet = "" + usGR.sys_id;
			gs.log("writeUpdateSet: Moving to Update Set '" + usGR.name + "'");
			gus.set(writeUpdateSet);
		
			//Write all captured objects to Update Set
			gs.log("writeUpdateSet: Writing captured objects to update set\n");
			for (var sys_id in this._capturedObjectMap) {
				var tblName = this._capturedObjectMap[sys_id];
				var gr = new GlideRecord(tblName);
				if (gr.get("" + sys_id))
					this._um.saveRecord(gr);
			}
			gs.log("writeUpdateSet: Finished writing captured objects to update set");
			
		} catch (ex) {
			gs.log("writeUpdateSet: ERROR while writing update set!: " + ex);
		} finally {
			
			//Always flush the cache
			this._flushObjectCache();
			
			//Always switch back to originally selected Update Set, if applicable.
			gus.set(currUpdateSetSysId);
			if (gus.get() != currUpdateSetSysId)
				gs.log("writeUpdateSet: WARNING: Failed to move back to originally selected update set.  MAKE SURE TO DO SO MANUALLY");
			else
				gs.log("writeUpdateSet: Moved back to original update set '" + currUpdateSetGR.name + "' successfully");
		}
	},

	/**
	* @param {string} tblName - name of the table to capture to the update set.
	* @return {void}
	*
	* Manually capturing a Table to an update set is non-trivial, as there are numerous secondary tables with artifacts 
	* related to that table and capturing just the table in an update set does NOT automatically trigger capture of those. 
	* This function provides that functionality so the entirety of a ServiceNow table/form can be captured atomically.  It captures 
	* the following related records for the specified table:
	*
	* 1.  Table Record (sys_db_object)
	* 2.  Table auto number, if applicable [Number Maintenance] (sys_number)
	* 3.  Table Dictionary Record ("collection" record in sys_dictionary)
	* 4.  Table fields (sys_dictionary) and their associated artifacts:
	*     a. Labels (sys_documentation)
	*     b. Choice Lists (sys_choice)
	*     c. Dictionary Overrides (sys_dictionary_override)
	*     d. Field-level ACL's (sys_security_acl, sys_security_acl_role)
	* 5.  Table-level ACL's (sys_security_acl, sys_security_acl_role)
	* 6.  Client Scripts (sys_script_client)
	* 7.  Business Rules (sys_script)
	* 8.  UI Actions (sys_ui_action)
	* 9.  UI Policies (sys_ui_policy, sys_ui_policy_action)
	* 10. Data Policies (sys_data_policy2, sys_data_policy_rule)
	* 11. Table Styles (sys_ui_style)
	* 12. View Rules (sysrule_view)
	*
	* NOTE: This function hasn't yet been tested on tables outside of the Global scope, so exercise caution in using it in secondary scopes.
	*/
	captureTableWithRelatedObjects: function(tblName) {
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureTableWithRelatedObjects: parameter 'tblName' is nil!";
		tblName = "" + tblName;  //ensure string
		
		//Ensure table exists
		var tblGR = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DB_OBJECT);
		if (!tblGR.get("name", tblName))
			throw "xSNUpdateSetBuilder.captureTableWithRelatedObjects: no table named '" 
				+ tblName + "' found!";
		
		//Save table record;
		this._recordObject(tblGR);
		
		//Save the "Collection" dictionary record for this table.
		var colDict = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DICTIONARY);
		colDict.addQuery("name", tblName);
		colDict.addNullQuery("element");
		this._captureObjectsFromGRQuery(colDict);
		
		//Capture Number fields (Number Maintenance) if applicable
		this.captureTableNumber(tblName);
		
		//Capture table level ACL's for this table
		this.captureACLsForTable(tblName);
		
		//Capture Client scripts
		var clScript = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_SCRIPT_CLIENT);
		clScript.addQuery("table", tblName);
		this._captureObjectsFromGRQuery(clScript);
		
		//Capture all business rules on the table
		var br = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_SCRIPT);
		br.addQuery("collection", tblName);
		this._captureObjectsFromGRQuery(br);
		
		//Capture UI Actions
		var ua = new GlideRecord(xSNUpdateSetBuilder._TABLES.UI_ACTION);
		ua.addQuery("table", tblName);
		this._captureObjectsFromGRQuery(ua);
		
		//Capture UI Polices
		this.captureUIPolicesForTable(tblName);
		
		//Capture Data Polices
		this.captureDataPolicesForTable(tblName);
		
		//Capture table styles
		var uis = new GlideRecord(xSNUpdateSetBuilder._TABLES.UI_STYLE);
		uis.addQuery("name", tblName);
		this._captureObjectsFromGRQuery(uis);
		
		//Capture View Rules
		var vr = new GlideRecord(xSNUpdateSetBuilder._TABLES.TABLE_VIEW_RULE);
		vr.addQuery("table", tblName);
		this._captureObjectsFromGRQuery(vr);
		
		//Capture all Dictionary records and related objects.
		var dict = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DICTIONARY);
		dict.addNotNullQuery("element");
		dict.addQuery("name", tblName);
		dict.query();
		while (dict.next()) {
			this.captureTableFieldAndAssociatedObjects(tblName, "" + dict.element);
		}
		
		//Capture Form Layouts, Related Lists, and Lists
		this.captureFormLayoutsForTable(tblName);
		this.captureListLayoutsForTable(tblName);
	},

	/**
 	* @param {string} catSysId - the sys_id of the desired Catalog Item to capture.
	* @return {void}
	*
	* This function will capture a single Catalog Item and the most common related artifacts, including:
	*
	* 1. Catalog Variables
	* 2. Associated Variable Sets, and their related artifacts
	*    a. Variables, including related artifacts for the following variable types:
	*       * "Select Box" and "Multiple Choice" types - related sys_choice records.
	*       * "UI Page" type - captures the linked UI Page record.
	*       * "Custom" and "Custom with Label" types - captures the linked Macro/Macroponent/Summary Macro and/or SP Widget where applicable.
	*    b. Catalog Client Scripts
	*    c. Catalog UI Policies and Actions.
	*    d. the M2M assocation of the variable set to the Catalog Item
	* 3. Catalog Client Scripts
	* 4. Catalog UI Policies and Actions.
	*
	* NOTE: As of this version, this method does NOT capture any associated Workflow/Flow/Execution Plan.
 	*/
	captureServiceCatalogItem: function(catSysId) {
		if (gs.nil(catSysId))
			throw "xSNUpdateSetBuilder.captureServiceCatalogItem: parameter 'catSysId' is nil!";
		
		//Get specified item and ensure it's a Catalog Item (i.e. not a record producer or other subclass.)
		var catItemGR = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM);
		if (!catItemGR.get(catSysId))
			throw "xSNUpdateSetBuilder.captureServiceCatalogItem: No Catalog Item found for sys_id '" + catSysId + "'!";
		if (catItemGR.sys_class_name != xSNUpdateSetBuilder._TABLES.CATALOG_ITEM)
			throw "xSNUpdateSetBuilder.captureServiceCatalogItem: Catalog Item for sys_id '" + catSysId + "' is a '" 
				+ catItemGR.sys_class_name.getDisplayValue() + "'; Catalog Item subclasses are not supported by this utility";

		//1. Capture Catalog Item
		this._recordObject(catItemGR);

		//2. Capture Variables.
		var catVars = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_VARIABLE);
		catVars.addQuery("cat_item", catSysId);
		catVars.query();
		while (catVars.next()) {
			this.captureServiceCatalogVariable("" + catVars.sys_id);
		}

		//3. Capture Variable Sets
		var varSetsM2M = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_VARIABLE_SET_M2M);
		varSetsM2M.addQuery("sc_cat_item", catSysId);
		varSetsM2M.addNotNullQuery("variable_set");
		varSetsM2M.query();
		while (varSetsM2M.next()) {
			
			//3a. Capture m2m record linking varset to the Catalog Item
			this._recordObject(varSetsM2M);

			//3b. Capture linked vriable set
			var varSet = varSetsM2M.variable_set.getRefRecord();
			if (varSet.isValidRecord())
				this._recordObject(varSet);

			//3b. Get all variables in the Variable Set
			var varSetVars = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_VARIABLE);
			varSetVars.addQuery("variable_set", "" + varSet.sys_id);
			varSetVars.query();
			while (varSetVars.next()) {
				this.captureServiceCatalogVariable("" + varSetVars.sys_id);
			}

			//3d. Capture associated Catalog UI Policies on the Variable Set
			var varSetUIPolicy = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_UI_POLICY);
			varSetUIPolicy.addQuery("variable_set", "" + varSet.sys_id);
			varSetUIPolicy.addQuery("applies_to", "set");
			varSetUIPolicy.query();
			while (varSetUIPolicy.next()) {
				this.captureCatalogUIPolicy("" + varSetUIPolicy.sys_id);
			}

			//3e. Capture associated Catalog Client Scripts on the Variable Set.
			var varSetClientScripts = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_CLIENT_SCRIPT);
			varSetClientScripts.addQuery("variable_set", "" + varSet.sys_id);
			varSetClientScripts.addQuery("applies_to", "set");
			this._captureObjectsFromGRQuery(varSetClientScripts);
		}

		//3. Capture Catalog UI Policies
		var catUIPolicy = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_UI_POLICY);
		catUIPolicy.addQuery("catalog_item", catSysId);
		catUIPolicy.addQuery("applies_to", "item");
		catUIPolicy.query();
		while (catUIPolicy.next()) {
			this.captureCatalogUIPolicy("" + catUIPolicy.sys_id);
		}

		//4. Capture Catalog Client Scripts.
		var catClientScripts = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_CLIENT_SCRIPT);
		catClientScripts.addQuery("cat_item", catSysId);
		catClientScripts.addQuery("applies_to", "item");
		this._captureObjectsFromGRQuery(catClientScripts);
	},
	
	/**
	* @param {string} vName - name of the Database View to capture. 
	* @return {void}
	*
	* This function captures the specified Database View (sys_db_view), its joined tables (sys_db_view_table), 
	* the specified fields (sys_db_view_table_field) if applicable, and the associated 
	* List and Form Layouts for the Database View, if defined.
	*/
	captureDatabaseView: function(vName) {
		if (JSUtil.nil(vName))
			throw "xSNUpdateSetBuilder.captureDatabaseView: parameter 'vName' is nil!";
		vName = "" + vName;  //ensure string
		
		//Capture Database View
		var vw = new GlideRecord(xSNUpdateSetBuilder._TABLES.DATABASE_VIEW);
		vw.addQuery("name", vName);
		vw.query();
		if (!vw.next())
			throw "xSNUpdateSetBuilder.captureDatabaseView: no DB view named '" + vName + "' found!'";
		this._recordObject(vw);
		
		//Capture Form and List Layouts
		//Capture Form Layouts, Related Lists, and Lists
		this.captureFormLayoutsForTable(vName);
		this.captureListLayoutsForTable(vName);
		
		//Capture View Tables
		var tbl = new GlideRecord(xSNUpdateSetBuilder._TABLES.DATABASE_VIEW_TABLE);
		tbl.addQuery("view", "" + vw.sys_id);
		tbl.query();
		while (tbl.next()) {
			this._recordObject(tbl);
			
			//Capture View Table's View Fields if applicable.
			var fld = new GlideRecord(xSNUpdateSetBuilder._TABLES.DATABASE_VIEW_TABLE_FIELD);
			fld.addQuery("view_table", "" + tbl.sys_id);
			fld.query();
			while (fld.next()) {
				this._recordObject(fld);
			}
		}
	},
	
	/**
	* @param {string} menuSysId - sys_id of the Application Menu to capture.
	* @return {void}
	*
	* This function allows for capturing an Application Menu (and its related modules) to an update set.  
	* Since Application Menus can, in theory, have multiple with the same name, this function requires 
	* specifying the sys_id of the intended menu.
	*
	* NOTE: As of the current version of this utility, mobile modules are NOT captured.
	*/
	captureApplicationMenuAndModules: function(menuSysId) {
		if (JSUtil.nil(menuSysId))
			throw "xSNUpdateSetBuilder.captureApplicationMenuAndModules: parameter 'menuSysId' is nil!";
		menuSysId = "" + menuSysId;  //ensure string
		
		//Capture app menu.
		var appMenu = new GlideRecord(xSNUpdateSetBuilder._TABLES.APPLICATION_MENU);
		if (!appMenu.get(menuSysId))
			throw "xSNUpdateSetBuilder.captureApplicationMenuAndModules: no App menu found for sys_id '" 
				+ menuSysId + "'";
		this._recordObject(appMenu);
		
		//Capture related modules.
		var mod = new GlideRecord(xSNUpdateSetBuilder._TABLES.APPLICATION_MENU_MODULE);
		mod.addQuery("application", "" + appMenu.sys_id);
		this._captureObjectsFromGRQuery(mod);
		
		//TODO Capture mobile modules
	},
	
	/**
	* @param {string} scrName - The API Name of the script include to capture.
	* @return {void}
	*
	* This function allows for capturing a Script Include to an update set; in order to avoid any confusion,
	* the parameter to specify is the API Name (as shown on the Script Include form), not the main Name field	
	*/
	captureScriptIncludeByName: function(scrName) {
		if (JSUtil.nil(scrName))
			throw "xSNUpdateSetBuilder.captureScriptIncludeByName: parameter 'scrName' is nil!";
		var apiName = this._getCurrentScopeName() + "." + scrName;  //Get unique scoped API name
		
		var scr = new GlideRecord(xSNUpdateSetBuilder._TABLES.SCRIPT_INCLUDE);
		scr.addQuery("api_name", apiName);
		this._captureUniqueGRObject(scr, "xSNUpdateSetBuilder.captureScriptIncludeByName");
	},
	
	/**
	* @param {string} roleName - The name of the role to capture.
	* @return {void}
	*
	* This function captures the specified role (from the current scope) into the update set.
	*/
	captureUserRole: function(roleName) {
		if (JSUtil.nil(roleName))
			throw "xSNUpdateSetBuilder.captureUserRole: parameter 'roleName' is nil!";
		roleName = "" + roleName;  //ensure string
		
		var rol = new GlideRecord(xSNUpdateSetBuilder._TABLES.ROLE);
		rol.addQuery("sys_scope", this._getCurrentScopeName());
		rol.addQuery("name", roleName);
		this._captureUniqueGRObject(rol, "xSNUpdateSetBuilder.captureUserRole");		
	},
	
	/**
	* @param {string} appName - The name of the Application (Name field) to capture (from the current scope).
	* @return {void}
	*
	* This function captures the Application record (sys_app) specified.  While these are typically created when 
	* building scoped apps, and so almost never need to be manually captured, the Application table pre-dates the 
	* Scoped Application functionality and so there will occasionally be Application records tied to global scope 
	* that may need to be captured into an update set for transport.
	*/
	captureApplicationRecord: function(appName) {
		if (JSUtil.nil(appName))
			throw "xSNUpdateSetBuilder.captureTableNumber: parameter 'appName' is nil!";
		appName = "" + appName;  //ensure string
		
		var app = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_APPLICATION);
		app.addQuery("name", appName);
		this._captureUniqueGRObject(app, "xSNUpdateSetBuilder.captureApplicationRecord");
	},
	
	/**
	* @param {string} catName - The name of the Property Category
	* @return {void}
	* 
	* This function allows for capturing a specified System Property Category (sys_properties_category) and its
	* associated System Properties (sys_properties and the sys_properties_category_m2m association records).  
	* It allows for capturing an entire cateogory of System Properties as an atomic unit.
	*/
	captureSystemPropertyCategoryWithAssociations: function(catName) {
		if (JSUtil.nil(catName))
			throw "captureSystemPropertyCategory: parameter 'catName' is nil!";
		
		//Capture the specified Category
		var cat = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_PROPERTIES_CATEGORY);
		cat.addQuery("name", catName);
		this._captureUniqueGRObject(cat, "xSNUpdateSetBuilder.captureSystemPropertyCategoryWithAssociations");
		
		//Capture all related properties.
		var assoc = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_PROPERTIES_CATEGORY_ASSOC);
		assoc.addQuery("category", "" + cat.sys_id);
		assoc.addNotNullQuery("property");  //should never happen
		assoc.query();
		while (assoc.next()) {
			var prop = assoc.property.getRefRecord();
			
			//Capture the system property itself
			this.captureSystemProperty("" + prop.name);
			
			//Capture Association to Category record.
			this._recordObject(assoc);
		}
	},
	
	/**
	* @param {string} propName - The name of the System Property to capture.
	* @return {void}
	*
	* Captures the specified System Property (as specified in the Name field, NOT just the Suffix field).
	*/
	captureSystemProperty: function(propName) {
		if (JSUtil.nil(propName))
			throw "xSNUpdateSetBuilder.captureSystemProperty: parameter 'propName' is nil!";
		
		//Capture specified system property (should only ever be one).
		var prop = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_PROPERTIES);
		prop.addQuery("name", propName);
		this._captureUniqueGRObject(prop, "xSNUpdateSetBuilder.captureSystemProperty");
	},
	
	/**
	* @param {string} evtName - The name of the System Eventy to capture.
	* @return {void}
	* 
	* Captures the specified System Event (as specified in the Name field, NOT just the Suffix field).
	*/
	captureEventRegistration: function(evtName) {
		if (JSUtil.nil(evtName))
			throw "xSNUpdateSetBuilder.captureEventRegistration: parameter 'evtName' is nil!";
		
		var evt = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_EVENT);
		evt.addQuery("event_name", evtName);
		this._captureUniqueGRObject(evt, "xSNUpdateSetBuilder.captureEventRegistration");
	},
	
	/**
	* @param {string} tblName - name of the table with records to be captured
	* @param {string} [optional] queryCondition - if specified, encoded query to filter results of records to be captured from table.
	* 
	* This function allows for capturing data records from a table that is not normally captured by Update Sets (i.e. a table that does 
	* not extend Application File).  It is useful for situations where an update set creates tables that need some baseline level of data
	* in them before use (ex. Tables that contain configuration records).
	*/
	captureDataRecordsFromTable: function(tblName, queryCondition) {
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureDataRecordsFromTable: parameter 'tblName' is nil!";
		tblName = "" + tblName;  //ensure string
		
		//Capture rows in specified table
		var gr = new GlideRecord(tblName);
		if (JSUtil.notNil(queryCondition))
			gr.addEncodedQuery("" + queryCondition);  //ensure string
		gr.query();
		this._captureObjectsFromGRQuery(gr);
		gs.log("xSNUpdateSetBuilder.captureDataRecordsFromTable: captured " + gr.getRowCount() + " records");
	},
	
	/**
	* @param {GlideRecord} gr - GlideRecord of object to capture.
	* @return {void}
	*
	* Whereas the captureDataRecordsFromTable() function is used to specify a table and an (optional) condition for a set of records to 
	* query and capture, this function allows for capturing a specific data record not normally captured by Update Sets (i.e. a table that
	* does not extend Application File) that has already been queried.  It is useful for situations where an update set creates tables that
	* need some baseline level of data in them before use (ex. Tables that contain configuration records).
	*/
	captureDataRecord: function(gr) {
		if (gr === null)
			throw "xSNUpdateSetBuilder.captureDataRecord: parameter 'gr' is null!";
		if (gr === undefined)
			throw "xSNUpdateSetBuilder.captureDataRecord: parameter 'gr' is undefined!";
		if (!(gr instanceof GlideRecord))
			throw "xSNUpdateSetBuilder.captureDataRecord: parameter 'gr' must be a GlideRecord!";
		var tblName = gr.getTableName();
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureDataRecord: parameter 'gr' must be initialied to a table!";
		
		//Capture record
		this._recordObject(gr);
	},
	
	/**
	* @param {string} tblName - name of the table to capture table-level ACL's for.
	* @return {void}
	* 
	* This function captures TABLE-level ACL's (and role-dependencies) for the specified table.  While its typical use is by the 
	* captureTableWithRelatedObjects() function in capturing the entirety of a table, it is nevertheless available for use directly
	* in cases where only capturing the ACL's for a table to an update set is needed.
	*/
	captureACLsForTable: function(tblName) {
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureACLsForTable: parameter 'tblName' is nil!";
		tblName = "" + tblName;  //ensure string
		
		//Ensure table exists
		var tblGRCount = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DB_OBJECT);
		tblGRCount.addQuery("name", tblName);
		tblGRCount.query();
		if (!tblGRCount.hasNext())
			throw "xSNUpdateSetBuilder.captureACLsForTable: no table named '" 
				+ tblName + "' found!";
		
		//Capture all TABLE level ACL's for the specified table (exclude FIELD level ACL's)
		var acl = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_SECURITY_ACL);
		acl.addQuery("name", tblName);
		acl.query();
		while (acl.next()) {
			this._recordObject(acl);
			
			//Capture any ACL required roles
			var aclRole = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_SECURITY_ACL_ROLE);
			aclRole.addQuery("sys_security_acl", "" + acl.sys_id);
			aclRole.query();
			this._captureObjectsFromGRQuery(aclRole);
		}
	},
	
	/**
	* @param {string} tblName - name of the table containing the field to capture field-level ACL's for.
	* @param {string} fieldName - name of the field to capture field-level ACL's for.
	* @return {void}
	*
	* This function captures FIELD-level ACL's (and role-dependencies) for the specified table and field.  While its typical use is by
	* the captureTableWithRelatedObjects() function in capturing the entirety of a table, it is nevertheless available for use directly 
	* in cases where only capturing the ACL's for a table field to an update set is needed.
	*/
	captureACLsForTableAndField: function(tblName, fieldName) {
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureACLsForTableAndField: parameter 'tblName' is nil!";
		if (JSUtil.nil(fieldName))
			throw "xSNUpdateSetBuilder.captureACLsForTableAndField: parameter 'fieldName' is nil!";
		tblName = "" + tblName;  //ensure string
		fieldName = "" + fieldName;  //ensure string.
		
		//Ensure table exists
		var tblGRCount = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DB_OBJECT);
		tblGRCount.addQuery("name", tblName);
		tblGRCount.query();
		if (!tblGRCount.hasNext())
			throw "xSNUpdateSetBuilder.captureACLsForTableAndField: no table named '" 
				+ tblName + "' found!";
		
		//Ensure field exists
		var fieldGRCount = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DICTIONARY);
		fieldGRCount.addQuery("name", tblName);
		fieldGRCount.addQuery("element", fieldName);
		fieldGRCount.query();
		if (!fieldGRCount.hasNext())
			throw "xSNUpdateSetBuilder.captureACLsForTableAndField: no field named '" 
				+ fieldName + "' found on table '" + tblName + "' found!";
		
		//Capture all FIELD level ACL's for the specified table and field
		var acl = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_SECURITY_ACL);
		acl.addQuery("name", tblName + "." + fieldName);
		acl.query();
		while (acl.next()) {
			this._recordObject(acl);
			
			//Capture any ACL required roles
			var aclRole = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_SECURITY_ACL_ROLE);
			aclRole.addQuery("sys_security_acl", "" + acl.sys_id);
			this._captureObjectsFromGRQuery(aclRole);
		}
	},
	
	/**
	* @param {string} tblName - name of the table for the UI Polices to capture.
	* @return {void}
	*
	* This function captures UI Policies (and child UI Policy Actions) for the specified table.  While its typical use is by
	* the captureTableWithRelatedObjects() function in capturing the entirety of a table, it is nevertheless available for use
	* directly in cases where only capturing the UI Policies for a table to an update set is needed.
	*/
	captureUIPolicesForTable: function(tblName) {
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureUIPolicesForTable: parameter 'tblName' is nil!";
		tblName = "" + tblName;  //ensure string
		
		//Ensure table exists
		var tblGRCount = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DB_OBJECT);
		tblGRCount.addQuery("name", tblName);
		tblGRCount.query();
		if (!tblGRCount.hasNext())
			throw "xSNUpdateSetBuilder.captureUIPolicesForTable: no table named '" 
				+ tblName + "' found!";
		
		//Capture all UI Polices for this table
		var ui = new GlideRecord(xSNUpdateSetBuilder._TABLES.UI_POLICY);
		ui.addQuery("table", tblName);
		ui.query();
		while (ui.next()) {
			this._recordObject(ui);
			
			//Capture UI Policy Actions
			var uia = new GlideRecord(xSNUpdateSetBuilder._TABLES.UI_POLICY_ACTION);
			uia.addQuery("ui_policy", "" + ui.sys_id);
			uia.query();
			this._captureObjectsFromGRQuery(uia);
		}
	},
	
	/**
	* @param {string} tblName - name of the table for the Data Polices to capture.
	* @return {void}
	*
	* This function captures Data Policies (and child Data Policy Rules) for the specified table.  While its typical use is by 
	* the captureTableWithRelatedObjects() function in capturing the entirety of a table, it is nevertheless available for use
	* directly in cases where only capturing the Data Policies for a table to an update set is needed.
	*/
	captureDataPolicesForTable: function(tblName) {
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureDataPolicesForTable: parameter 'tblName' is nil!";
		tblName = "" + tblName;  //ensure string
		
		//Ensure table exists
		var tblGRCount = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DB_OBJECT);
		tblGRCount.addQuery("name", tblName);
		tblGRCount.query();
		if (!tblGRCount.hasNext())
			throw "xSNUpdateSetBuilder.captureDataPolicesForTable: no table named '" 
				+ tblName + "' found!";
		
		//Capture all Data Polices for this table
		var dp = new GlideRecord(xSNUpdateSetBuilder._TABLES.DATA_POLICY);
		dp.addQuery("model_table", tblName);
		dp.query();
		while (dp.next()) {
			this._recordObject(dp);
			
			//Capture Data Policy Rules
			var dpr = new GlideRecord(xSNUpdateSetBuilder._TABLES.DATA_POLICY_RULE);
			dpr.addQuery("sys_data_policy", "" + dp.sys_id);
			this._captureObjectsFromGRQuery(dpr);
		}
	},
	
	/**
	* @param {string} tblName - name of the table to get auto numbers for.
	* @return {void}
	*
	* This function allows for capturing a auto numbers (Number Maintenance) [sys_number] for the specified 
	* table; while there is usually only one auto number per table, this method will capture all of them if 
	* there are multiple for that table.
	*/
	captureTableNumber: function(tblName) {
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureTableNumber: parameter 'tblName' is nil!";
		tblName = "" + tblName;  //ensure string
		
		//Ensure table exists
		var tblGR = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DB_OBJECT);
		if (!tblGR.get("name", tblName))
			throw "xSNUpdateSetBuilder.captureTableNumber: no table named '" 
				+ tblName + "' found!";
		
		var nm = new GlideRecord(xSNUpdateSetBuilder._TABLES.TABLE_NUMBER);
		nm.addQuery("category", tblName);
		this._captureObjectsFromGRQuery(nm);
	},
	
	/**
	* @param {string} tblName - name of the table to capture all List Layouts for.
	* @return {void}
	*
	* This function allows for capturing List Layouts [sys_ui_list] (and all associated artifacts), for all views on
	* the specified table; fortunately, the platform will capture the associated child UI elements anytime a List Layout
	* is captured, therefore, we don't have to explicitly do it here.  While the typical use of this function is by the 
	* captureTableWithRelatedObjects() function in capturing the entirety of a table, it is nevertheless available for use
	* directly in cases where only capturing the List Layouts for a table to an update set is needed.
	*/
	captureListLayoutsForTable: function(tblName) {
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureListLayoutsForTable: parameter 'tblName' is nil!";
		tblName = "" + tblName;  //ensure string
		
		//1. Capture List Layouts
		var lst = new GlideRecord(xSNUpdateSetBuilder._TABLES.LIST_LAYOUT);
		lst.addQuery("name", tblName);
		lst.addNotNullQuery("view");  //Must be tied to a view
		lst.addNullQuery("sys_user");  //We don't want user personalized list layouts.
		lst.addNullQuery("relationship");  //We don't want list layouts for Relationship records.
		lst.query();
		while (lst.next()) {
			
			//If View Name starts with RPT then it's for a list view report and we don't want it.
			var vw = lst.view.getRefRecord();
			var vwNameUpper = ("" + vw.name).toUpperCase();
			if (vwNameUpper.startsWith("RPT"))
				continue;			
			
			//Ensure dependent View for this Form Layout already captured.
			this._captureUIView("" + vw.sys_id);
			
			//Capture the List Layout
			//NOTE: When capturing a List Layout record, the GlideUpdateManager class will
			//automatically record the child UI Element records as xSNUpdateSetBuilder, so we don't need to do
			//it here explicitly.
			this._recordObject(lst);
		}
		
		//2. Capture List Control
		var lc = new GlideRecord(xSNUpdateSetBuilder._TABLES.LIST_CONTROL);
		lc.addQuery("name", tblName);
		lc.query();
		while (lc.next())
			this._recordObject(lc);
	},
	
	/**
	* @param {string} tblName - name of the table to capture all Form Layouts and associated Related Lists for.
	* @return {void}
	*
	* This function allows for capturing Form Layouts [sys_ui_section] (and all associated artifacts), for all views on the 
	* specified table; fortunately, the platform will capture the associated child UI elements anytime a Form Layout is captured,
	* therefore, we don't have to explicitly do it here.  While the typical use of this function is by the 
	* captureTableWithRelatedObjects() function in capturing the entirety of a table, it is nevertheless available for use directly
	* in cases where only capturing the Form Layouts for a table to an update set is needed.
	*
	* NOTE: This method also captures all Related Lists (sys_ui_related_list) for each Form Layout, since they are part of the designed
	* Form Layout; as with Form and List Layouts, the child elements of a Related List record are automatically captured by the platform
	* when a Related List is captured, therefore we don't explicitly have to capture them here.
	*/
	captureFormLayoutsForTable: function(tblName) {
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureFormLayoutsForTable: parameter 'tblName' is nil!";
		tblName = "" + tblName;  //ensure string
		
		//Capture all Form records (one per view) and associated Form Sections (tabs, elements)
		var frm = new GlideRecord(xSNUpdateSetBuilder._TABLES.FORM);
		frm.addQuery("name", tblName);
		frm.addNotNullQuery("view");  //eliminate any bad data.
		frm.query();
		while (frm.next()) {
			
			//If View Name starts with RPT then it's for a form view on a report and we don't want it.
			var vw = frm.view.getRefRecord();
			var vwSysId = "" + vw.sys_id;
			var vwNameUpper = ("" + vw.name).toUpperCase();
			if (vwNameUpper.startsWith("RPT"))
				continue;
			
			//1. Capture the Form record
			this._recordObject(frm);
			
			//2. Iterate through the Form Section records (sys_ui_form_section)[These are the individual tabs on the form.]
			//to capture the individual Form Section records (sys_ui_section)[These define the layout on each tab and form].
			//NOTE: We don't have to capture the top level Form Section (sys_ui_form_section) records cause the Update Set
			//API automatically does that when capturing the Form record.
			var frs1 = new GlideRecord(xSNUpdateSetBuilder._TABLES.FORM_SECTION);
			frs1.addQuery("sys_ui_form", "" + frm.sys_id);
			frs1.addNotNullQuery("sys_ui_section");  //eliminate any bad data.
			frs1.query();
			while (frs1.next()) {
				
				//Capture the each child Form Section (sys_ui_section) record.
				//NOTE: We don't have to capture the child Section Element (sys_ui_element) records cause the Update Set
				//API automatically does that when capturing their parent Form Section (sys_ui_section) record.
				var frs2 = frs1.sys_ui_section.getRefRecord();
				this._recordObject(frs2);
			}
		
			//3. Grab Related Lists for this Form and View combo
			//Capture Releated Lists.  
			//NOTE: When capturing a Related List record, the GlideUpdateManager class will
			//automatically record the child UI Element records as xSNUpdateSetBuilder, so we don't need to do
			//it here explicitly.
			var rel = new GlideRecord(xSNUpdateSetBuilder._TABLES.FORM_RELATED_LIST);
			rel.addQuery("name", tblName);
			rel.addQuery("view", vwSysId);
			rel.query();
			if (rel.next()) {  //should only ever be one.
				
				//Capture the Related List record.
				//NOTE: We don't have to capture the child RElated List Entries (sys_ui_related_list_entry) records cause
				//the Update Set API automatically does that when capturing their parent Related List record.
				this._recordObject(rel);
				
			} else
				gs.log("WARNING: No Related List found for Table '" + tblName + "' for View '" + vw.name + "'");
		}
	},
	
	/**
	* @param {string} tblName - name of the table for the Data Polices to capture.
	* @return {void}
	*
	* This function captures a specified Field for the specified table (and related objects).  While its typical use is by 
	* the captureTableWithRelatedObjects() function in capturing the entirety of a table field, it is nevertheless available for use
	* directly in cases where only capturing an individual field to an update set is needed.
	*/
	captureTableFieldAndAssociatedObjects: function(tblName, fldName) {
		if (JSUtil.nil(tblName))
			throw "xSNUpdateSetBuilder.captureTableFieldAndAssociatedObjects: parameter 'tblName' is nil!";
		tblName = "" + tblName;  //ensure string
		if (JSUtil.nil(fldName))
			throw "xSNUpdateSetBuilder.captureTableFieldAndAssociatedObjects: parameter 'fldName' is nil!";
		fldName = "" + fldName;  //ensure string
		
		//Ensure field exists on table.
		var dict = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DICTIONARY);
		dict.addQuery("name", tblName);
		dict.addQuery("element", fldName);
		dict.query();
		if (!dict.next())
			throw "xSNUpdateSetBuilder.captureTableFieldAndAssociatedObjects: No field named '" + fldName 
				+ "' on table '" + tblName + "' found!";
		
		//save the Dictionary record for field.
		this._recordObject(dict);
		
		//Get Label records for this field.
		var lbl = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DOCUMENTATION);
		lbl.addQuery("name", tblName);
		lbl.addQuery("element", fldName);
		this._captureObjectsFromGRQuery(lbl);

		//Get any choice lists
		var cho = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_CHOICE);
		cho.addQuery("name", tblName);
		cho.addQuery("element", fldName);
		this._captureObjectsFromGRQuery(cho);

		//Capture FIELD level ACL's for this table and field.
		this.captureACLsForTableAndField(tblName, fldName);

		//Capture dictionary overrides
		var over = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_DICTIONARY_OVERRIDE);
		over.addQuery("name", tblName);
		over.addQuery("element", fldName);
		this._captureObjectsFromGRQuery(over);
	},
	
	/**
	* @param {string} ruleSysId - sys_id of the System Archive rule to capture.
	* @return {void}
	*
	* This function captures a specified Archive Rule (and related objects).
	*/
	captureArchivalRule: function(ruleSysId) {
		if (JSUtil.nil(ruleSysId))
			throw "captureArchivalRule: parameter 'ruleSysId' is nil!";
		ruleSysId = "" + ruleSysId;  //ensure string
		
		//Ensure exists
		var rul = new GlideRecord(xSNUpdateSetBuilder._TABLES.ARCHIVE_RULE);
		if (!rul.get(ruleSysId))
			throw "xSNUpdateSetBuilder.captureArchivalRule: No archive rule found for sys_id " + ruleSysId;
		this._recordObject(rul);
		
		//Capture any "Archive Related Records" child records.
		var rel = new GlideRecord(xSNUpdateSetBuilder._TABLES.ARCHIVE_RULE_RELATED);
		rel.addQuery("archive_map", ruleSysId);
		rel.query();
		while (rel.next()) {
			
			//Capture Rel Record.
			this._recordObject(rel);
			
			//If this record references another Table Rule, then that must also be captured.
			if (!rel.table_archive_rule.nil()) {
				
				//Ensure no circular references
				var chld = "" + rel.table_archive_rule;
				if (chld != ruleSysId)
					this.captureArchivalRule(chld);
			}
		}
	},

	/**
	 * @param {string} catUIPolicySysId - sys_id of the Catalog Item UI Policy to capture
	 * @return {void}
	 * 
	 * Captures a single Catalog Item UI Polciy record and its related UI Policy Actions.
	 */
	captureCatalogUIPolicy: function(catUIPolicySysId) {
		if (JSUtil.nil(catUIPolicySysId))
			throw "xSNUpdateSetBuilder.captureCatalogUIPolicy: parameter 'catUIPolicySysId' is nil!";

		//Ensure exists.
		var catUIPolicy = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_UI_POLICY);
		if (!catUIPolicy.get(catUIPolicySysId))
			throw "xSNUpdateSetBuilder.captureCatalogUIPolicy: no Catalog UI policy found for sys_id '" + catUIPolicySysId + "'!";
		this._recordObject(catUIPolicy);

		//Capture all child UI Policy Actions
		var actions = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_UI_POLICY_ACTION);
		actions.addQuery("ui_policy", catUIPolicySysId);
		this._captureObjectsFromGRQuery(actions);
	},

	/**
	 * @param {string} varSysId - sys_id of the Catalog Item Variable to capture
	 * @return {void}
	 * 
	 * Captures a single Catalog Item Variable, along with related objects for certain variable types (Choice fields, UI Page, etc.).
	 * 
	 * NOTE: As of the current version of this script include, an SP Widget or Macroponent linked to a "custom" variable type may
	 * not be fully captured and you may need to export it separately for import to the target instance.
	 */
	captureServiceCatalogVariable: function(varSysId) {
		if (gs.nil(varSysId))
			throw "xSNUpdateSetBuilder.captureServiceCatalogVariable: parameter 'varSysId' is nil!";
		
		//Get specified Catalog Item Variable.
		var varGR = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_VARIABLE);
		if (!varGR.get(varSysId))
			throw "xSNUpdateSetBuilder.captureServiceCatalogVariable: No Catalog Variable found for sys_id '" + varSysId + "'!";
		
		//1. Capture the variable
		this._recordObject(varGR);

		//Capture related artifacts for variable types that have them.
		switch ("" + varGR.type) {
			
			//Custom and Custom With Label
			case '14':
			case '17':

				//Get related UI artifacts on the Custom variable
				if (!varGR.macro.nil())	
					this._recordObject(varGR.macro.getRefRecord());
				if (!varGR.summary_macro.nil())	
					this._recordObject(varGR.summary_macro.getRefRecord());				
				//TODO add in-depth capture of these components
				if (!varGR.sp_widget.nil())	{
					gs.log("\tWARNING: This Variable links to a SP Widget, which are not fully supported for capture. You may need to manually import some of the widget's depdencies");
					this._recordObject(varGR.sp_widget.getRefRecord());
				}
				if (!varGR.macroponent.nil()) {
					gs.log("\tWARNING: This Variable links to a Macroponent, which are not fully supported for capture. You may need to manually import some of its depdencies");
					this._recordObject(varGR.macroponent.getRefRecord());
				}
				break;

			//Multiple Choice & Select Box
			case '3':
			case '5':
				
				//Capture all related Question Choices (active or otherwise)
				var choices = new GlideRecord(xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_VARIABLE_QUESTION_CHOICE);
				choices.addQuery("question", "" + varGR.sys_id);
				this._captureObjectsFromGRQuery(choices);
				break;

			//UI Page
			case '15':

				//Get related UI Page
				if (!varGR.ui_page.nil())	
					this._recordObject(varGR.ui_page.getRefRecord());
				break;
		}
	},	
	
	/**
	 * @return {number} count of unique objects currently queued for writing to an update set.
	 */
	getObjectCount: function() {
		return this._capturedObjectCount;
	},
	
	///////////////////////////////////////////// INTERNAL FUNCTIONS /////////////////////////////////////////////
	//                                                                                                          //
	// Internal helper functions that users of this utility should never need to call directly.                 //
	//                                                                                                          //
	//////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	/**
	* @param {string} sys_id - sys_id of the sys_ui_view record to capture.
	* @return {void}
	*
	* Several supported objects for capture (List Layouts, Form Layouts, Related Lists) are necessarily linked to
	* a UI View for the specific view of the Table/Form they are for; therefore, these functions will end up making
	* many calls to ensure the dependent views have been captured, and if not, automatically capture them even if
	* the caller didn't specify to capture them.  In order to avoid repeated that logic, this function is called
	* by those respective functions to perform this check and capture the View record if necessary.
	*/
	_captureUIView: function(sys_id) {
		if (JSUtil.nil(sys_id))
			throw "xSNUpdateSetBuilder.captureUIViewsForTable: parameter 'sys_id' is nil!";
		sys_id = "" + sys_id;  //ensure string
		
		//Only capture if not already
		if (!this._capturedObjectMap[sys_id]) {
			var uiv = new GlideRecord(xSNUpdateSetBuilder._TABLES.UI_VIEW);
			if (!uiv.get(sys_id))
				throw "xSNUpdateSetBuilder.captureUIViewsForTable: No UI View found for sys_id '" 
					+ sys_id + "'";
			
			//Record UI View since not already in cache.
			gs.log("Capturing UI View '" + uiv.title + "'");
			this._recordObject(uiv);
		}
	},
	
	/**
	* @param {GlideRecord} gr - A GlideRecord object with query conditions pre-loaded.
	* @param {string} callingMethod - name of the function calling this function, to be included in the error
	*                               that is thrown if there is an issue.
	* 
	* Several of the public API functions capture objects, for which there should only ever be ONE record
	* for the given conditions. As a result, those functions need to perform error checking to ensure the
	* query they've built to retrieve it only returns exactly one record and errors out otherwise. This
	* internal function performs that check and records the object only if exactly one is returned.
	*/
	_captureUniqueGRObject: function(gr, callingMethod) {
		if (!gr)
			throw "xSNUpdateSetBuilder._captureUniqueGRObject: parameter 'gr' is nil!";
		gr.query();
		
		//Only record the object if there is exactly one, as expected.
		if (gr.getRowCount() == 1 && gr.next())
			this._recordObject(gr);
		
		//Otherwise throw the appropriate error for the actual result found.
		else if (gr.getRowCount() < 1) {
			throw callingMethod + ": No " + gr.getTableName() + " found for query '" 
				+ gr.getEncodedQuery() + "'";
		} else
			throw callingMethod + ": found multiple (" + gr.getRowCount() + ") " + gr.getTableName() + " for provided query!";
	},
	
	/**
	* @param {GlideRecord} gr - A GlideRecord object with query conditions pre-loaded.
	* @return {void}
	*
	* Many of the public API functions capture a series of objects based on some query criteria, and then 
	* iterate through the results capturing each object. This internal function is used to delegate that 
	* boiler-plate logic.  It wil call the query() method on the GlideRecord and then capture every
	* object in the result set.
	*/
	_captureObjectsFromGRQuery: function(gr) {
		if (!gr)
			throw "xSNUpdateSetBuilder._captureObjectsFromGRQuery: parameter 'gr' is nil!";
		//TODO additional validations
		
		//Run provided query and capture all records from it.
		gr.query();
		while (gr.next())
			this._recordObject(gr);
	},
	
	/**
	* @param {GlideRecord} gr - object to capture for recording to an update set.
	* @return {void}
	*
	* This core function is used by all the public API functions to perform the task of capturing a 
	* specified  GlideRecord object for capture in an update set.
	*/
	_recordObject: function(gr) {
		if (!gr)
			return;
		
		//Mapping: sys_id -> table of object. (only parameters needed to capture object in Update Set).
		var sys_id = "" + gr.sys_id;
		var capturedObject = this._capturedObjectMap[sys_id];
		if (!capturedObject) {
			capturedObject = this._capturedObjectMap[sys_id] = gr.getTableName();
			
			//Increment counter and output logs if applicable.
			this._capturedObjectCount++;			
			gs.log("Captured '" + gr.getTableName() + " object with sys_id '" + sys_id + "'");
		}
	},
	
	/**
	* @return {string} name of the current scope the user session is running in.
	*
	* WORKAROUND FUNCTION: There are a few places where knowing the user's current selected scope is required; 
	* ServiceNow provides a GlideSystem function for this purpose (getCurrentScopeName), however when in the Global 
	* scope, it returns "rhino.global" instead of just "global" as expected.  This function simply calls getCurrentScope
	* and returns "global" in the case the user is in Global scope, or the true value otherwise.
	*/
	_getCurrentScopeName: function() {
		var scp = gs.getCurrentScopeName();
		return (scp == "rhino.global") ? "global" : scp;
	},
	
	/**
	* Returns the GlideRecord (sys_scope) for the user's current scope.
	*/
	_getCurrentScopeGR: function() {
		var sn = this._getCurrentScopeName();
		if (JSUtil.nil(sn))
			throw "xSNUpdateSetBuilder._getCurrentScopeGR: No scope name found!";  //should never happen.
		
		//Return Scope GR
		var scp = new GlideRecord(xSNUpdateSetBuilder._TABLES.SYS_SCOPE);
		if (!scp.get("name", sn))
			throw "xSNUpdateSetBuilder._getCurrentScopeGR: No scope found with name '" + sn + "'";
		return scp;
	},
	
	/**
	 * resets the object capture cache, removing any previously captured objects.
	 */
	_flushObjectCache: function() {
		this._capturedObjectMap = {};
		this._capturedObjectCount = 0;
	},

    type: 'xSNUpdateSetBuilder',
	version: '2024.4.20'
};

//Enum of all tables supported by this utility.
xSNUpdateSetBuilder._TABLES = {};
xSNUpdateSetBuilder._TABLES.SYS_SCOPE = "sys_scope";
xSNUpdateSetBuilder._TABLES.UPDATE_SET = "sys_update_set";
xSNUpdateSetBuilder._TABLES.CATALOG_ITEM = "sc_cat_item";
xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_VARIABLE = "item_option_new";
xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_VARIABLE_SET_M2M = "io_set_item";
xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_VARIABLE_QUESTION_CHOICE = "question_choice";
xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_UI_POLICY = "catalog_ui_policy";
xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_UI_POLICY_ACTION = "catalog_ui_policy_action";
xSNUpdateSetBuilder._TABLES.CATALOG_ITEM_CLIENT_SCRIPT = "catalog_script_client";
xSNUpdateSetBuilder._TABLES.SYS_APPLICATION = "sys_app";
xSNUpdateSetBuilder._TABLES.SYS_PROPERTIES = "sys_properties";
xSNUpdateSetBuilder._TABLES.SYS_PROPERTIES_CATEGORY = "sys_properties_category";
xSNUpdateSetBuilder._TABLES.SYS_PROPERTIES_CATEGORY_ASSOC = "sys_properties_category_m2m";
xSNUpdateSetBuilder._TABLES.SYS_DB_OBJECT = "sys_db_object";
xSNUpdateSetBuilder._TABLES.SYS_DICTIONARY = "sys_dictionary";
xSNUpdateSetBuilder._TABLES.UI_VIEW = "sys_ui_view";
xSNUpdateSetBuilder._TABLES.SYS_EVENT = "sysevent_register";
xSNUpdateSetBuilder._TABLES.LIST_LAYOUT = "sys_ui_list";
xSNUpdateSetBuilder._TABLES.LIST_CONTROL = "sys_ui_list_control";
xSNUpdateSetBuilder._TABLES.FORM = "sys_ui_form";
xSNUpdateSetBuilder._TABLES.FORM_SECTION = "sys_ui_form_section";
xSNUpdateSetBuilder._TABLES.FORM_LAYOUT = "sys_ui_section";
xSNUpdateSetBuilder._TABLES.FORM_RELATED_LIST = "sys_ui_related_list";
xSNUpdateSetBuilder._TABLES.SYS_DOCUMENTATION = "sys_documentation";
xSNUpdateSetBuilder._TABLES.SYS_CHOICE = "sys_choice";
xSNUpdateSetBuilder._TABLES.SYS_SECURITY_ACL = "sys_security_acl";
xSNUpdateSetBuilder._TABLES.SYS_SECURITY_ACL_ROLE = "sys_security_acl_role";
xSNUpdateSetBuilder._TABLES.SYS_DICTIONARY_OVERRIDE = "sys_dictionary_override";
xSNUpdateSetBuilder._TABLES.SYS_SCRIPT = "sys_script";
xSNUpdateSetBuilder._TABLES.SYS_SCRIPT_CLIENT = "sys_script_client";
xSNUpdateSetBuilder._TABLES.SCRIPT_INCLUDE = "sys_script_include";
xSNUpdateSetBuilder._TABLES.UI_ACTION = "sys_ui_action";
xSNUpdateSetBuilder._TABLES.UI_POLICY = "sys_ui_policy";
xSNUpdateSetBuilder._TABLES.UI_POLICY_ACTION = "sys_ui_policy_action";
xSNUpdateSetBuilder._TABLES.DATA_POLICY = "sys_data_policy2";
xSNUpdateSetBuilder._TABLES.DATA_POLICY_RULE = "sys_data_policy_rule";
xSNUpdateSetBuilder._TABLES.UI_STYLE = "sys_ui_style";
xSNUpdateSetBuilder._TABLES.TABLE_VIEW_RULE = "sysrule_view";
xSNUpdateSetBuilder._TABLES.APPLICATION_MENU = "sys_app_application";
xSNUpdateSetBuilder._TABLES.APPLICATION_MENU_MODULE = "sys_app_module";
xSNUpdateSetBuilder._TABLES.DATABASE_VIEW = "sys_db_view";
xSNUpdateSetBuilder._TABLES.DATABASE_VIEW_TABLE = "sys_db_view_table";
xSNUpdateSetBuilder._TABLES.DATABASE_VIEW_TABLE_FIELD = "sys_db_view_table_field";
xSNUpdateSetBuilder._TABLES.ROLE = "sys_user_role";
xSNUpdateSetBuilder._TABLES.TABLE_NUMBER = "sys_number";
xSNUpdateSetBuilder._TABLES.ARCHIVE_RULE = "sys_archive";
xSNUpdateSetBuilder._TABLES.ARCHIVE_RULE_RELATED = "sys_archive_related";
