// Function 1: Gorgias → Slack
// Receives ticket data from Gorgias HTTP integration,
// filters to ONLY chat tickets, then posts to Slack with ticket ID.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // ✅ Only forward chat widget tickets — ignore email, SMS, contact form, etc.
  if (data.channel !== 'chat') {
    return { statusCode: 200, body: 'Not a chat ticket, ignored' };
  }

  const slackMessage = {
    text: `💬 *New Chat Inquiry* [Ticket #${data.ticket_id}]\n*From:* ${data.customer_email}\n*Message:* ${data.message}\n<https://ryder.gorgias.com/app/tickets/${data.ticket_id}|View in Gorgias>\n\n_Reply in this thread using [brackets] to send to customer. Plain text = internal only._`
  };

  const slackResponse = await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slackMessage)
  });

  if (!slackResponse.ok) {
    return { statusCode: 500, body: 'Failed to post to Slack' };
  }

  return { statusCode: 200, body: 'Posted to Slack' };
};
