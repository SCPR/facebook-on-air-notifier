facebook-on-air-notifier
========================
Experimental AWS Lambda function to periodically post the current on-air program to Facebook

## Installation

Paste this into a new Lambda function with a role that has permissions for Cloudwatch Logs and DynamoDB.

Then add your `CLIENT_ACCESS_TOKEN` and `PAGE_ID` environment variables.  Look to Facebook's documentation for how to create a Facebook page & app, and how to generate those values for your Lambda function.

You can trigger the function through any means, though it probably makes the most sense to set up a Cron expression with Cloudwatch to periodically trigger it.

