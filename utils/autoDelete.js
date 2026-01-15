/**
 * Automatically delete a message after a specified delay
 * @param {Message} message - The message to delete
 * @param {number} delay - Delay in milliseconds (default: 45000ms = 45s)
 */
function autoDelete(message, delay = 45000) {
  if (!message || !message.deletable) return;

  setTimeout(() => {
    message.delete().catch((error) => {
      // Ignore errors if message was already deleted
      if (error.code !== 10008) {
        console.error("Error auto-deleting message:", error);
      }
    });
  }, delay);
}

/**
 * Send a message and auto-delete it after a delay
 * @param {TextChannel} channel - Channel to send the message to
 * @param {Object} options - Message options (content, embeds, etc.)
 * @param {number} delay - Delay in milliseconds (default: 45000ms = 45s)
 * @returns {Promise<Message>}
 */
async function sendAndDelete(channel, options, delay = 45000) {
  const message = await channel.send(options);
  autoDelete(message, delay);
  return message;
}

module.exports = {
  autoDelete,
  sendAndDelete,
};
