const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const body = event.body;
  let payload;

  try {
    payload = JSON.parse(body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  if (payload.type === 'url_verification') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge: payload.challenge })
    };
  }

  const timestamp = event.headers['x-slack-request-timestamp'];
  const slackSignature = event.headers['x-slack-signature'];

  if (!timestamp || !slackSignature) {
    return { statusCode: 401, body: 'Missing Slack headers' };
  }

  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
    return { statusCode: 401, body: 'Request too old' };
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature))) {
      return { statusCode: 401, body: 'Invalid signature' };
    }
  } catch (e) {
    return { statusCode: 401, body: 'Signature error' };
  }

  const slackEvent = payload.event;

  if (
    !slackEvent ||
    slackEvent.type !== 'message' ||
    !slackEvent.thread_ts ||
    slackEvent.subtype === 'bot_message' ||
    slackEvent.bot_id
  ) {
    return { statusCode: 200, body: 'OK' };
  }

  const text = slackEvent.text || '';
  const match = text.match(/^\[(.+)\]$/s);
  if (!match) {
    return { statusCode: 200, body: 'Internal message, ignored' };
  }

  const replyText = match[1].trim();

  const threadResponse = await fetch(
    `https://slack.com/api/conversations.replies?channel=${slackEvent.channel}&ts=${slackEvent.thread_ts}&limit=1`,
    { headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` } }
  );

  const threadData = await threadResponse.json();
  const parentText = threadData.messages?.[0]?.text || '';
  const ticketMatch = parentText.match(/Ticket #(\d+)/);

  if (!ticketMatch) {
    return { statusCode: 200, body: 'No ticket ID found' };
  }

  const ticketId = ticketMatch[1];

  const gorgiasResponse = await fetch(
    `https://ryder.gorgias.com/api/tickets/${ticketId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(
          `${process.env.GORGIAS_EMAIL}:${process.env.GORGIAS_API_KEY}`
        ).toString('base64')
      },
      body: JSON.stringify({
        body_html: `<p>${replyText}</p>`,
        channel: 'chat',
        from_agent: true,
        source: {
          type: 'chat',
          from: { name: 'Ryder Support', address: process.env.GORGIAS_EMAIL }
        }
      })
    }
  );

  if (!gorgiasResponse.ok) {
    const err = await gorgiasResponse.text();
    console.error('Gorgias error:', err);
    return { statusCode: 500, body: 'Failed to post reply' };
  }

  return { statusCode: 200, body: 'Reply sent!' };
};
