# Online account item emails

Online user accounts receive email at their registered address when:

1. An item request is submitted through the user request endpoint or the administrator saves/links a pending RIS to the account.
2. The administrator approves and issues the request. The message includes actual issued quantities rather than requested quantities.
3. A return is confirmed, including a direct administrator-recorded return in View Records or a linked Returned Supply/PRS receipt. The message includes returned quantities and conditions. A pending user return request is not a confirmed return.

Offline recipients do not receive account emails. Messages include the document reference, item details, and a clickable button to the user's Issued Items or Returned Items page. Set `FRONTEND_URL` to the deployed frontend origin. After signing in, users are returned to the page linked in the email. Production falls back to `https://pais-v1.vercel.app` if `FRONTEND_URL` is unset; local development uses `http://localhost:5173`.

Use the existing SMTP settings: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`. Do not commit credentials. No real mail is sent by the integration tests.

`WorkflowEmail` stores a unique event key for each document and event. Issuance and return events are queued in the same database transaction as the movement and sent after commit. Repeated processing does not create another event. Transport failures leave the email pending with a retry time; stock remains committed. A stable Message-ID is reused on retries. SMTP cannot guarantee exactly-once delivery if the provider accepts a message but the connection fails before acknowledgement.

Successful API responses attempt delivery of up to three due events. The long-running Node server also retries every minute; serverless deployments retry on subsequent successful requests and do not have that continuous timer. Configure a scheduled worker if retries must run when there is no application traffic. Without `SMTP_HOST`, events stay queued until mail is configured.

The new collection and indexes are initialized on server startup. Provision indexes separately if automatic index creation is disabled in your deployment.
