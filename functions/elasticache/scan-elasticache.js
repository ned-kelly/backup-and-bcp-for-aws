// Iterate through all AWS regions and check for any provisioned ElastiCache deployments that have a Backup Tag and are Reddis Based.
// Author: David Nedved.
// ------------------------------------------------------------------------------------------------------------

var awsRegions = require('aws-regions');
//var backupWorker = require('./launch-backup-worker');

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
    var elasticache = new AWS.ElastiCache();

    var params = {};
    elasticache.describeCacheClusters(params, function(err, data) {
        if (err) {

            // The EFS service is not available in every region currently.
            if(err.originalError.errno == 'ENOTFOUND') {
                console.log("Skipping: " + region + ", ElastiCache service is not provided here.");
            } else {
                console.log(err, err.stack);
            }

        } else { 
            console.dir(data);

            for (var i in data.CacheClusters) {
                var node = data.CacheClusters[i]

                // Only support backing up for Redis cache servers...
                if(node.Engine == 'redis') {

                    // var params = {
                    //   ResourceName: 'STRING_VALUE' /* required */
                    // };
                    // elasticache.listTagsForResource(params, function(err, data) {
                    //   if (err) console.log(err, err.stack); // an error occurred
                    //   else     console.log(data);           // successful response
                    // });


                }
            }
        }
    });
}
