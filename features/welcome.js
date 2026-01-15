const { EmbedBuilder } = require("discord.js");

async function sendWelcomeMessage(member, config) {
  if (!config.welcome_channel_id) return;

  const channel = member.guild.channels.cache.get(config.welcome_channel_id);
  if (!channel) return;

  const defaultMessage = `Welcome {user} to **{server}**! 🎉`;
  let message = config.welcome_message || defaultMessage;
  message = message.replace(/{user}/g, `${member}`).replace(/{server}/g, member.guild.name);

  const embed = new EmbedBuilder()
    .setTitle("👋 Welcome to the Community!")
    .setDescription(message + `\n\nWe're glad to have you here!`)
    .setColor(0x57F287)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: "📅 Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "👥 Member Count", value: `#${member.guild.memberCount}`, inline: true }
    )
    .setFooter({ text: "Enjoy your stay and feel free to reach out if you need help!" })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(console.error);
}

async function sendLeaveMessage(member, config) {
  if (!config.leave_channel_id) return;

  const channel = member.guild.channels.cache.get(config.leave_channel_id);
  if (!channel) return;

  const defaultMessage = `**{user}** has left {server}. 👋`;
  let message = config.leave_message || defaultMessage;
  message = message.replace(/{user}/g, member.user.tag).replace(/{server}/g, member.guild.name);

  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => r.name)
    .slice(0, 5)
    .join(", ");

  const embed = new EmbedBuilder()
    .setTitle("👋 Member Departure")
    .setDescription(message)
    .setColor(0xED4245)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: "📅 Joined", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
      { name: "👥 Members Now", value: `${member.guild.memberCount}`, inline: true }
    )
    .setFooter({ text: "We hope to see them again soon" })
    .setTimestamp();

  if (roles) {
    embed.addFields({ name: "🎭 Roles They Had", value: roles });
  }

  await channel.send({ embeds: [embed] }).catch(console.error);
}

module.exports = {
  sendWelcomeMessage,
  sendLeaveMessage,
};
