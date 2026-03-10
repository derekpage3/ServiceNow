This is a probe/sensor combo that can be used to SNMP walk the entire MIB-2 and private.enterprises hierarchy of OID's on a device; It is NOT meant to be used in a production scenario, but rather when 
developing a probe/pattern for a new device where a MIB is unavailable to provide the OID's that will return data.  It's essentially a "shot gun" approach to finding data.  
Once found, you can then determine the OID's to query in your custom probe or pattern.  This should be deleted from the system after you're done using it and should never be loaded in a PROD instance.

<b>NOTE:</b> This is a legacy enhancement built on the "Fuji" version of the platform, and modern functionality in the Pattern Designer can be used for exploratory scanning instead.
