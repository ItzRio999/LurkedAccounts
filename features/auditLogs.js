const { EmbedBuilder } = require("discord.js");
const { saveJson } = require("../utils/fileManager");
const { mention } = require("../utils/permissions");

async function logMemberJoin(member, config) {
  if (!config.audit_log_channel_id) return;

  const logChannel = member.guild.channels.cache.get(config.audit_log_channel_id);
  if (!logChannel) return;

  const accountAge = Date.now() - member.user.createdTimestamp;
  const daysOld = Math.floor(accountAge / (1000 * 60 * 60 * 24));
  const isNew = daysOld < 7;

  const embed = new EmbedBuilder()
    .setTitle("Member Joined")
    .setDescription(`${mention(member.id)} ${member.user.tag}`)
    .addFields(
      { name: "User ID", value: member.id, inline: true },
      {
        name: "Account Created",
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      { name: "Total Members", value: `${member.guild.memberCount}`, inline: true }
    )
    .setColor(isNew ? 0xFEE75C : 0x57F287)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  if (isNew) {
    embed.setFooter({ text: "Account is less than 7 days old" });
  }

  await logChannel.send({ embeds: [embed] }).catch(console.error);
}

async function logMemberLeave(member, config) {
  if (!config.audit_log_channel_id) return;

  const logChannel = member.guild.channels.cache.get(config.audit_log_channel_id);
  if (!logChannel) return;

  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => r.name)
    .join(", ") || "None";

  const joinedTimestamp = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

  const embed = new EmbedBuilder()
    .setTitle("Member Left")
    .setDescription(`${member.user.tag}`)
    .addFields(
      { name: "User ID", value: member.id, inline: true },
      { name: "Total Members", value: `${member.guild.memberCount}`, inline: true }
    )
    .setColor(0xED4245)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  if (joinedTimestamp) {
    embed.addFields({ name: "Joined", value: `<t:${joinedTimestamp}:R>`, inline: true });
  }

  if (roles !== "None") {
    embed.addFields({ name: "Roles", value: roles.slice(0, 1024) });
  }

  await logChannel.send({ embeds: [embed] }).catch(console.error);
}

async function logRoleUpdate(before, after, config) {
  if (!config.audit_log_channel_id) return;

  const addedRoles = after.roles.cache.filter((r) => !before.roles.cache.has(r.id));
  const removedRoles = before.roles.cache.filter((r) => !after.roles.cache.has(r.id));

  if (addedRoles.size === 0 && removedRoles.size === 0) return;

  const logChannel = after.guild.channels.cache.get(config.audit_log_channel_id);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle("Member Roles Updated")
    .setDescription(`${mention(after.id)} ${after.user.tag}`)
    .setColor(0x5865F2)
    .setThumbnail(after.user.displayAvatarURL())
    .setTimestamp();

  if (addedRoles.size > 0) {
    embed.addFields({
      name: "Added Roles",
      value: addedRoles.map((r) => r.name).join(", "),
    });
  }

  if (removedRoles.size > 0) {
    embed.addFields({
      name: "Removed Roles",
      value: removedRoles.map((r) => r.name).join(", "),
    });
  }

  await logChannel.send({ embeds: [embed] }).catch(console.error);
}

async function logMessageDelete(message, config, data) {
  if (!message.guild || message.author?.bot) return;
  if (!config.audit_log_channel_id) return;

  const logChannel = message.guild.channels.cache.get(config.audit_log_channel_id);
  if (!logChannel) return;

  const messageData = data.message_cache?.[message.id];
  const content = message.content || messageData?.content || "*[Content not cached]*";

  const embed = new EmbedBuilder()
    .setTitle("Message Deleted")
    .setDescription(`**Channel:** ${message.channel}\n**Author:** ${message.author || "Unknown"}`)
    .addFields({
      name: "Content",
      value: content.slice(0, 1024) || "*[No content]*",
    })
    .setColor(0xED4245)
    .setTimestamp();

  if (message.author) {
    embed.setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    });
  }

  if (message.attachments.size > 0) {
    const attachments = message.attachments.map((a) => a.name).join(", ");
    embed.addFields({ name: "Attachments", value: attachments });
  }

  await logChannel.send({ embeds: [embed] }).catch(console.error);
}

async function logMessageEdit(before, after, config) {
  if (!after.guild || after.author?.bot) return;
  if (!config.audit_log_channel_id) return;
  if (before.content === after.content) return;

  const logChannel = after.guild.channels.cache.get(config.audit_log_channel_id);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle("Message Edited")
    .setDescription(`**Channel:** ${after.channel}\n**Author:** ${after.author}\n[Jump to Message](${after.url})`)
    .addFields(
      {
        name: "Before",
        value: (before.content || "*[No content]*").slice(0, 1024),
      },
      {
        name: "After",
        value: (after.content || "*[No content]*").slice(0, 1024),
      }
    )
    .setColor(0xFEE75C)
    .setTimestamp();

  if (after.author) {
    embed.setAuthor({
      name: after.author.tag,
      iconURL: after.author.displayAvatarURL(),
    });
  }

  await logChannel.send({ embeds: [embed] }).catch(console.error);
}

function cacheMessage(message, data, dataPath) {
  if (!data.message_cache) data.message_cache = {};

  data.message_cache[message.id] = {
    content: message.content,
    author_id: message.author.id,
    channel_id: message.channel.id,
    timestamp: message.createdTimestamp,
  };

  // Keep cache size reasonable (last 1000 messages)
  const cacheEntries = Object.entries(data.message_cache);
  if (cacheEntries.length > 1000) {
    cacheEntries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    data.message_cache = Object.fromEntries(cacheEntries.slice(-1000));
  }

  saveJson(dataPath, data);
}

module.exports = {
  logMemberJoin,
  logMemberLeave,
  logRoleUpdate,
  logMessageDelete,
  logMessageEdit,
  cacheMessage,
};
