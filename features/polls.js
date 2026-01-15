const { EmbedBuilder, MessageFlags } = require("discord.js");
const { saveJson } = require("../utils/fileManager");

async function createPoll(interaction, data, dataPath) {
  const question = interaction.options.getString("question", true);
  const options = [];
  for (let i = 1; i <= 5; i++) {
    const opt = interaction.options.getString(`option${i}`);
    if (opt) options.push(opt);
  }
  const duration = interaction.options.getInteger("duration") || 60;

  if (options.length < 2) {
    const embed = new EmbedBuilder()
      .setDescription("❌ You need at least 2 options to create a poll!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (options.length > 10) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Maximum 10 options allowed!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  const optionText = options.map((opt, i) => `${emojis[i]} ${opt}`).join("\n");

  const endTime = Date.now() + duration * 60000;
  const endTimestamp = Math.floor(endTime / 1000);

  const embed = new EmbedBuilder()
    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }) })
    .setTitle("📊 Community Poll")
    .setDescription(`**${question}**\n\nReact with your choice below:\n\u200b\n${optionText}`)
    .addFields(
      { name: "⏰ Duration", value: `${duration} minute${duration !== 1 ? "s" : ""}`, inline: true },
      { name: "🕒 Ends", value: `<t:${endTimestamp}:R>`, inline: true },
      { name: "👤 Created By", value: interaction.user.toString(), inline: true }
    )
    .setColor(0x5865F2)
    .setFooter({ text: "Vote by clicking the reactions below" })
    .setTimestamp();

  await interaction.reply({ content: "Creating poll...", flags: MessageFlags.Ephemeral });

  const message = await interaction.channel.send({ embeds: [embed] });

  for (let i = 0; i < options.length; i++) {
    await message.react(emojis[i]).catch(console.error);
  }

  data.polls[message.id] = {
    question,
    options,
    channel_id: interaction.channel.id,
    creator_id: interaction.user.id,
    end_time: endTime,
    active: true,
  };
  saveJson(dataPath, data);

  setTimeout(() => endPoll(message.id, interaction.guild, data, dataPath), duration * 60000);

  const successEmbed = new EmbedBuilder()
    .setDescription("✅ Poll created successfully!")
    .setColor(0x57F287);
  await interaction.editReply({ embeds: [successEmbed] });
}

async function endPoll(messageId, guild, data, dataPath) {
  const poll = data.polls[messageId];
  if (!poll || !poll.active) return;

  poll.active = false;
  saveJson(dataPath, data);

  const channel = guild.channels.cache.get(poll.channel_id);
  if (!channel) return;

  try {
    const message = await channel.messages.fetch(messageId);
    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

    const results = [];
    let totalVotes = 0;

    for (let i = 0; i < poll.options.length; i++) {
      const reaction = message.reactions.cache.get(emojis[i]);
      const count = reaction ? reaction.count - 1 : 0;
      totalVotes += count;
      results.push({ option: poll.options[i], votes: count, emoji: emojis[i] });
    }

    results.sort((a, b) => b.votes - a.votes);

    const maxVotes = results[0]?.votes || 0;
    const resultsText = results
      .map((r) => {
        const percentage = totalVotes > 0 ? Math.round((r.votes / totalVotes) * 100) : 0;
        const bar = createVoteBar(percentage, 15);
        const winner = r.votes === maxVotes && maxVotes > 0 ? " 👑" : "";
        return `${r.emoji} **${r.option}**${winner}\n${bar} ${r.votes} vote${r.votes !== 1 ? "s" : ""} (${percentage}%)`;
      })
      .join("\n\n");

    const winnerText = maxVotes > 0 ? `\n\n**Winner:** ${results[0].option} 👑` : "";

    const embed = new EmbedBuilder()
      .setTitle("📊 Poll Results")
      .setDescription(`**${poll.question}**${winnerText}\n\u200b\n${resultsText || "No votes received"}`)
      .setColor(0x57F287)
      .setFooter({ text: `${totalVotes} total vote${totalVotes !== 1 ? "s" : ""} • Thank you for participating!` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Update original poll message
    const originalEmbed = message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(0x808080)
      .setFooter({ text: "This poll has ended • Results posted below" });

    await message.edit({ embeds: [updatedEmbed] }).catch(console.error);
  } catch (error) {
    console.error("Error ending poll:", error);
  }
}

function createVoteBar(percentage, length = 15) {
  const filled = Math.floor((percentage / 100) * length);
  const empty = length - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

module.exports = {
  createPoll,
  endPoll,
};
