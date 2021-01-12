// Iterate through all AWS regions and check for any provisioned ElastiCache deployments that have a Backup Tag and are Reddis Based.
// Author: David Nedved.
// ------------------------------------------------------------------------------------------------------------

var awsRegions = require('aws-regions');
var engineRedis = require('./engine-redis');

module.exports.handler = function(event, context, callback) {

    var regions = awsRegions.list({ public: true });
    Object.keys(regions).forEach(function(key) {

        var region = regions[key];
        checkRegion(region.code)
    });
};

function getAccountARN(response) {

    var AWS = require('aws-sdk');
    var iam = new AWS.IAM();
    var metadata = new AWS.MetadataService()

    var _ = iam.getUser({}, (err, data) => {
      if (err)
        metadata.request('/latest/meta-data/iam/info/', (err, data) => {
          if (err) console.log(err, err.stack);
          else console.log(JSON.parse(data).InstanceProfileArn.split(':')[4]);
        });
      else
        response(data.User.Arn.split(':')[4])
        //console.log(data.User.Arn.split(':')[4]);
    });

}


// Loop through each AWS region and copy tags away...
function checkRegion(region) {

    var AWS = require('aws-sdk');
    AWS.config.update({region: region});
    var elasticache = new AWS.ElastiCache();

    var params = {};
    elasticache.describeCacheClusters(params, function(err, data) {
        if (err) {

            // The EFS service is not available in every region currently.
            try {
                if(err.originalError.errno == 'ENOTFOUND') {
                    console.log("Skipping: " + region + ", ElastiCache service is not provided here.");
                } else {
                    console.log(err, err.stack);
                }
            } catch (e) {
                console.log("Skipping Region: " + region);
            }

        } else {

            for (var i in data.CacheClusters) {
                var node = data.CacheClusters[i]

                // Only support backing up for Redis cache servers...
                if(node.Engine == 'redis') {

                    getAccountARN(function(arn) {
                        getElastiCacheTagsAndBackup(node, elasticache, region, arn)
                    })

                }
            }
        }
    });
}

function getElastiCacheTagsAndBackup(node, elasticache, region, arn) {

    var params = {
        ResourceName: `arn:aws:elasticache:${region}:${arn}:cluster:${node.CacheClusterId}`
    };

    elasticache.listTagsForResource(params, function(err, data) {
    if (err) console.log(err, err.stack);

        if(data.TagList && data.TagList.length) {

            for (var i in data.TagList) {
                var tag = data.TagList[i]
                if(tag.Key == "Backup") {
                    console.log("BACKUP NOW!")
                    engineRedis.dump(node, region, function(response) {
                        console.dir(response);
                    })
                }
            }
        } // else - there's no tags specified specified on this ElastiCache instance...
    });
}

