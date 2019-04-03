// Iterate through all AWS regions and check for any running RDS instances that have a Backup Tag.
// Any databases with a backup tag will then be dumped into S3 ...
// Author: David Nedved.
// ------------------------------------------------------------------------------------------------------------

var awsRegions = require('aws-regions');
var enginePostgres = require('./engine-postgres');

module.exports.handler = function(event, context, callback) {

    var regions = awsRegions.list({ public: true });
    Object.keys(regions).forEach(function(key) {

        var region = regions[key];
        checkRegion(region.code)

    });

};

// Loop through each AWS region and copy tags away...
function checkRegion(region) {
 
    var AWS = require('aws-sdk');
    AWS.config.update({region: region});
    var rds = new AWS.RDS();

    var params = {};
    rds.describeDBInstances(params, function(err, data) {
        if (err) console.log(err, err.stack);

        for (var i in data.DBInstances) {
            var dbInstance = data.DBInstances[i]
            getRDSTags(dbInstance, rds, region)
        }

    });
}

function getRDSTags(instanceObject, rds, region) {

    // If ARN exists and it's not an empty object, check for backup tags...
    if(typeof instanceObject.DBInstanceArn !== "undefined") {

        var params = {
            ResourceName: instanceObject.DBInstanceArn
        };
        rds.listTagsForResource(params, function(err, data) {
            if (err) console.log(err, err.stack);

            if(data.TagList && data.TagList.length) {

                var backupConfigObject = {}

                for (var i in data.TagList) {
                    var tag = data.TagList[i]
                    if(tag.Key == "BackupConfiguration") {

                        try {
                            var configObject = Buffer.from(tag.Value, 'base64');
                        } catch(e) {
                            configObject = false;
                            backupConfigObject = false;  
                        }

                        if(configObject !== false) {
                            try {
                                backupConfigObject = JSON.parse(configObject);

                                // Check Username/Password variables exist...
                                if(!backupConfigObject.hasOwnProperty('Username')){
                                    backupConfigObject = false;
                                }
                                if(!backupConfigObject.hasOwnProperty('Password')){
                                    backupConfigObject = false;
                                }

                            } catch(e) {
                                console.error(e);
                                backupConfigObject = false;
                            }
                        }
                    }
                }

                // Don't launch backup if the credentials for the DB are missing or JSON config from RDS tags is invalid...
                if(backupConfigObject == false) {
                    console.log("WARNING: " + instanceObject.Endpoint.Address + ", was skipped due to an invalid 'BackupConfiguration' tag. Please check that the tag contains valid JSON encoded in Base64 format, and that all the required fields/values are specified.");
                } else {
                    for (var i in data.TagList) {
                        var tag = data.TagList[i]

                        if(tag.Key == "Backup") {

                            if(Object.keys(backupConfigObject).length == 0) {
                                console.log("WARNING: " + instanceObject.Endpoint.Address + ", was tagged for backup, but not backed up due to missing 'BackupConfiguration' tag!")
                            } else {

                                if(instanceObject.Engine == "postgres") {

                                    console.log(instanceObject.Endpoint.Address + ", tagged for backup.");
                                    
                                    // Launch PostgreSQL Backup Dump Instance...
                                    enginePostgres.dump(instanceObject, region, backupConfigObject, function(response) {
                                        console.dir(response);
                                    })

                                } else if(instanceObject.Engine == "mysql") {
                                    // MySQL Backup Code...
                                } else {
                                    console.error("Engine: '" + instanceObject.Engine + "', is not currently supported by this function!")
                                }
                            }

                        }
                    }
                }
            } // else - there's no tags specified specified on this rds instance...
        });
    } 
}