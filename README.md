# Lambda Backup & BCP Functions for AWS
--------------------

## Overview

This is my dirty little collection of scripts (wrapped and executed via Lambda & an auto-spawning EC2 Instances, deployed using the Serverless Framework) used to backup all of your critical infrastructure **within your entire AWS account (The scripts will iterate through EVERY AWS region and check for resources to be backed up)**. Backups are stored in a single S3 bucket, using standard file formats (such as DNS zone files, SQL Dumps etc) where ever possible.

The goal is to try and use standard existing scripts/tooling to perform these tasks rather than re-inventing the wheel - several existing scripts and tools from various authors have been either included or forked (and wrapped) in Serverless functions to perform these tasks. Standard tools such as `mysqldump`, `cli53`, `dd` etc that run on EC2 Instances or within Lambda Functions are used to create "standard" file formats, so that backups may be easily read/imported to whatever infrastructure you require in the future. 

Infrastructure is auto-backed up and managed via "Resource Tags" (These can be defined virtually on any infrastructure within in the AWS console), allowing anyone performing DevOps within your organisation to quickly enable backups on a resource as required.

Backups may also optionally be copied from your S3 bucket to another Cloud or infrastructure provider of your choice if you are using these functions as part of your Disaster Recovery & Business Continuity Plan. If you're using Google Cloud, you should consider using the built-in sync tooling. See: [Google Cloud Storage - Creating a Transfer Job from S3 to GCS](https://cloud.google.com/storage-transfer/docs/create-manage-transfer-console).

----------------------------------------

**If you require assistance deploying or customising this solution or any other enterprise grade Cloud infrastructure, please feel free to reach out to me - I provide consultancy services.**



### Current Features/AWS Services Covered:

| AWS Service                       | Supported / Backed Up Via | File Format             | Comments/Description                                                                                                                                                                                                                                                                                                                   |
|-----------------------------------|---------------------------|-------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| EC2 Instance Tags --> EBS Volumes | Lambda: NodeJS Function   | N/A                     | Copy all tags from EC2 Instance to EBS volumes & Volume Mapping Details (in all regions - _Think of this as a lightweight [Graffiti Monkey](https://github.com/Answers4AWS/graffiti-monkey)_ - It's required so that we can back up our EC2 instance EBS volumes based on whatever 'tags' are specified in the AWS management console) |
| EBS Volume Shapshots              | Lambda: NodeJS Function   | N/A                     | Create nightly EBS backups of any EBS volumes tagged with `Backup=true` & also rotates any snapshots older than X days.                                                                                                                                                                                                                |
| Route53                           | Lambda: cli53             | DNS Zone Files          | Backup all Route53 Records into S3 Bucket (uses [cli53](https://github.com/barnybug/cli53) to generate standard DNS zone files)                                                                                                                                                                                                        |
| RDS                               | EC2 Worker Instance       | Gzipped SQL Dump Files  | Dumps all databases within an RDS instance to the specified S3 backup bucket (Currently PostgreSQL & MySQL are supported - Uses the latest pg_dump / mysqldup from their official docker repo's)                                                                                                                                       |
| EFS                               | EC2 Worker Instance       | Raw Files, in S3 Bucket | Backup all EFS (Elastic File System) data in for any EFS deployments tagged with `Backup=true`, to S3 backup bucket.                                                                                                                                                                                                                   |

* _EC2 Worker Instances are launched via the Lambda Backup Functions each night, and then terminated upon completion. No special configuration is required other than the base configuration below._


#### The following additional features are currently a work in progress:
* Copy EBS snapshots/backups into S3 Bucket (stored as a GZipped ISO)
* Copy all data from "Backups S3 Bucket" to another Cloud Provider (Currently GCE is Supported) - This is intended for Business Continuity Planning.

**Note that restoring your data is currently a manual process - These scripts are intended to just get your data out of AWS and backed up in another Cloud Provider for BCP purposes.**

If you are looking at backing up ALL your infrastructure and not just the critical components - you should consider writing your Infrastructure as Code (using a tool such as [Terraform](https://www.terraform.io/).) and then checking this into your source control.

## Getting Started

Once you have cloned down the project, you will need to configure some basic variables to get everything running...

### Setting up IAM Roles (for worker instances)

EC2 instances that are auto-spawned from the lambda functions require access to your backup S3 bucket (to upload DB dumps etc into the bucket). You'll need to create an IAM policy (with access to the S3 bucket) and then a Role with the policy associated to it.

If you're happy using default access to S3 from the backup instance, you can use the template example role below -- Note you will need the [AWS CLI Tools](https://aws.amazon.com/cli/) installed and configured on your machine before running the following:

```bash
# Be sure to set your AWS profile name if you have multiple accounts configured in your ~/.aws/config file...
export AWS_PROFILE="your-aws-profile-name"

POLICY_ARN=`aws iam create-policy --policy-name "AWSBackupTasksRoleForS3" \
    --description "Allows EC2 Instances spawned by the Backup Tasks Lambda functions to save files into specified S3 Backup Bucket" \
    --policy-document '{"Version": "2012-10-17","Statement": [{"Sid": "AWSBackupTasksRoleForS3","Effect": "Allow","Action": "s3:*","Resource": ["*"]}]}' \
    --output=text | awk '{print $2}'`

# Create IAM Role (This is the role that will be used for launching the EC2 backup instances)
aws iam create-role --role-name "AWSBackupTasksRoleForS3" \
    --description "Allows EC2 Instances spawned by the Backup Tasks Lambda functions to save files into specified S3 Backup Bucket" \
    --assume-role-policy-document '{"Version": "2012-10-17","Statement": [{"Effect": "Allow","Principal": {"Service": "ec2.amazonaws.com"},"Action": "sts:AssumeRole"}]}'

# Associate the IAM policy that was created in the first step with the IAM Role that we just made.
aws iam attach-role-policy  --role-name "AWSBackupTasksRoleForS3" \
    --policy-arn "$POLICY_ARN"

# We also need to create an Instance Profile, then assign the IAM role to this EC2 Instance Profile...
aws iam create-instance-profile --instance-profile-name "AWSBackupTasksRoleForS3"
aws iam add-role-to-instance-profile --role-name "AWSBackupTasksRoleForS3" \
    --instance-profile-name "AWSBackupTasksRoleForS3"
```

### Setting environment variables & configuration for Lambda Functions

Some basic configuration is required before the scripts can do their thing - These are various variables that are passed through during the serverless deployment (as an environment variable) such as the S3 bucket to backup to etc.

```bash
cp config.yml.example config.yml

# Then, edit the config.yml file to suit your requirements
vi config.yml
```

**Environment variables supported in `config.yml` currently include:**

| Variable           | Required | Example Value           | Description                                                                                                                                                                                                                                                                                             |
|--------------------|----------|-------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `AWS_PROFILE`      | no       | default                 | The AWS profile configured on your local machine used to deploy the Serverless functions.                                                                                                                                                                                                               |
| `AWS_REGION`       | yes      | ap-southeast-2          | The region within AWS that you wish to deploy the backup functions to.                                                                                                                                                                                                                                  |
| `S3_BUCKET`        | yes      | s3-backups-bucket       | The S3 bucket name where your backup files will be stored/uploaded to                                                                                                                                                                                                                                   |
| `EC2_KEYPAIR_NAME` | no       | your-ec2-keypair        | The ssh key-pair name that you wish to use for any EC2 worker instances spawned by lambda - Note the keypair **MUST exist in EVERY region** that an instance is launched in - This is not required, but useful if you need to SSH into an instance to troubleshoot etc.                                 |
| `EC2_WORKER_ROLE`  | no       | AWSBackupTasksRoleForS3 | IAM Role Name that EC2 Instances spawned (to dump databases, ebs & efs shares etc) will use -- NB This role needs access to S3 to write/upload the files.                                                                                                                                               |
| `EC2_WORKER_SIZE`  | no       | m4.large                | The kind of instance that you would like to launch to perform the backup tasks - Suggest using an instance that is **available in all AWS regions** if you change this - By default running a single m4.large each night for less than one hour will cost you around $3.50 per month in backup charges  |
| `BACKUP_TIMEZONE`  | no       | Australia/Brisbane      | Specify the timezone that backups will run here if you do not want them to be scheduled on UTC time.                                                                                                                                                                                                    |
| `BACKUP_SCHEDULE`  | no       | cron(0 1 * * ? *)       | A cron style syntax may also be specified to determine how often backups should run - By default backups run daily at 1AM.                                                                                                                                                                              |

## Deploying

This project should be manually deployed, however the tagging of resources that you want to back up may be done via standard Terraform provisioning tasks.

To manually deploy these backup functions into a new account you may:

```bash
# Install packages from package.json (includes serverless framework)
npm install

# Deploy using the AWS Credentials set in your ~/.aws/config file...
serverless deploy --aws-profile your-aws-profile-name
```


## Backing up Infrastructure with AWS 'TAGS'
### Managing EC2 Instance Volume Backups

By default the script will run each night and backup your EC2 instances that are tagged accordingly - Backups are retained for 30 days unless configured otherwise.

To backup an EC2 Instance you may simply add the following tags to the instance via the AWS Management Console... _(Tags will be automatically copied from the instance to the EBS volumes every 15 minutes)._


| EC2 Tag   | Example Value | Description                                                                   |
|-----------|---------------|-------------------------------------------------------------------------------|
| Backup    | true          | Tells the script to backup this instance                                      |
| Retention | 30            | Numeric value (in days) to keep the snapshot before automatically deleting it |


### Managing RDS Dumps 

Like EC2 Instance Backups, RDS dumps are run each night and then synchronised into the specified backup S3 bucket. Unlike EBS Volume Snapshots, there are no retention settings for nightly DB dumps (stored as gzipped sql files) - You will need to configure a policy on your S3 bucket.

| RDS Tag   | Example Value | Description                                                                   |
|-----------|---------------|-------------------------------------------------------------------------------|
| Backup    | true          | Tells the script to dump every database within RDS instance to the Backups S3 Bucket. |
| BackupConfiguration    | _JSON Object Encoded as Base64String_          | This should be a Base64 Encoded string with the Username & Password that can be used to access the database to perform a Dump (example below). |

**BackupConfiguration JSON Object Example:**

The `BackupConfiguration ` Tag currently accepts the following Json Keys:

 * Username
 * Password

To generate this configuration from the Command Line, simply run:

```bash
echo -n '{
    "Username": "<rdsRootUsername>",
    "Password": "<rdsRootPassword>"
}' | base64
```
_(NB update the example to match the correct credentials for each RDS instance)_

** **Note**: ** 

* The program dumps all accessible databases within the RDS instance into S3 - If you have hundreds of gb's of data this may not be effective and may need to look at other backup methods.

* RDS Backups are launched using latest Amazon Linux AMI (in each region), using the official DB vendor's docker image (i.e mysql or postgresql docker) ensuring that the CLI tools used by scripts are always the latest stable release.

* Instances are launched with the same VPC, Subnet & Security Groups that are assigned to the RDS instance that is being backed up - This assumes that the subnet has network access to S3 - If your subnet running the RDS instance does not have outbound internet access the scripts will not work.

### Managing EFS Backups 

If you have any Elastic Filesystem Deployments - files will be copied (via NFS) into your backup S3 bucket. Backups are run nightly. Unlike EBS Volume Snapshots, there are no retention settings for nightly EFS Sync's - you will need to set a S3 Lifecycle Policy on these directories if you wish to only retain X days of backups.


| EFS Tag   | Example Value | Description                                                                   |
|-----------|---------------|-------------------------------------------------------------------------------|
| Backup    | true          | Tells the script to copy all files from the EFS deployment to the Backups S3 Bucket. |

** **Note**: ** 

* EFS Backups are launched using latest Amazon Linux AMI (in each region) with the same VPC, Subnet & Security Groups that are assigned to the EFS Network Mount Point. This assumes that the subnet has outbound network/internet access to S3 - If your subnet running the EFS deployment does not have outbound internet access the scripts will not work.


## Calling the Backup Functions Locally

Occasionally you may want to fire off the various Serverless functions locally without actually deploying the code into AWS Lambda.

This is relatively straightforward with the Serverless Framework and can be performed like so:

```bash
# 1 - Export any environment variables you may want to set

export AWS_PROFILE="aws-profile-name"
export EC2_KEYPAIR_NAME="keypair-name"

# 2 - Invoke the fun function directly i.e.
#     See the serverless.yml file for a list of function names.

serverless invoke local -f backupRDS
```


## Additional Considerations

* Scripts do not currently take into consideration of the lifecycle of objects in your S3 bucket - Create a S3 "Lifecycle Rule" to delete files after X days or Y Months if you do not wish to indefinitely store your backups created in your S3 bucket.