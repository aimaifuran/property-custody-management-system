const successResponse = async (res, message, data = {}, status = 200) => {
  // Flush only committed events. This also retries pending mail on serverless requests.
  await require('./workflowEmails').deliverWorkflowEmails();
  return res.status(status).json({ success: true, message, data });
};

const errorResponse = (res, message, errors = [], status = 500) => {
  return res.status(status).json({ success: false, message, errors });
};

module.exports = { successResponse, errorResponse };
