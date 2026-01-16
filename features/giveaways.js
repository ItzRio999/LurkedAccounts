const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { saveJson } = require("../utils/fileManager");

// Start a giveaway
async function startGiveaway(interaction, data, dataPath) {
  const prize = interaction.options.getString("prize", true);
  const duration = interaction.options.getInteger("duration", true);
  const winners = interaction.options.getInteger("winners") || 1;
  const description = interaction.options.getString("description");
  const imageUrl = interaction.options.getString("image");

  if (duration < 1 || duration > 10080) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Duration must be between 1 minute and 7 days (10080 minutes)!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (winners < 1 || winners > 20) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Winners must be between 1 and 20!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const endTime = Date.now() + duration * 60 * 1000;
  const endTimestamp = Math.floor(endTime / 1000);

  const embed = new EmbedBuilder()
    .setTitle(prize)
    .setDescription(
      (description ? `${description}\n\n` : "") +
      `React with 🎉 to enter\n\n` +
      `**Winners:** ${winners}\n` +
      `**Ends:** <t:${endTimestamp}:F> (<t:${endTimestamp}:R>)\n` +
      `**Hosted by:** ${interaction.user}`
    )
    .setColor(0xF59E42)
    .setAuthor({ name: "Giveaway", iconURL: "https://cdn-icons-png.flaticon.com/512/3227/3227447.png" })
    .setFooter({ text: `${winners} winner${winners !== 1 ? "s" : ""} | Ends` })
    .setTimestamp(endTime);

  if (imageUrl) embed.setImage(imageUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_enter")
      .setLabel("Enter Giveaway")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🎉")
  );

  const message = await interaction.channel.send({ embeds: [embed], components: [row] });
  await message.react("🎉");

  // Store giveaway data
  if (!data.giveaways) data.giveaways = [];
  data.giveaways.push({
    message_id: message.id,
    channel_id: interaction.channel.id,
    guild_id: interaction.guild.id,
    prize: prize,
    description: description,
    winners: winners,
    host_id: interaction.user.id,
    end_time: endTime,
    ended: false,
    entries: [],
    image_url: imageUrl
  });
  saveJson(dataPath, data);

  const successEmbed = new EmbedBuilder()
    .setDescription(`✅ Giveaway started! It will end <t:${endTimestamp}:R>`)
    .setColor(0x57F287);

  await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
}

// Handle giveaway button click
async function handleGiveawayButton(interaction, data, dataPath) {
  const giveaway = data.giveaways?.find(g => g.message_id === interaction.message.id);

  if (!giveaway) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Giveaway data not found!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (giveaway.ended) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This giveaway has already ended!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const userId = interaction.user.id;

  if (giveaway.entries.includes(userId)) {
    giveaway.entries = giveaway.entries.filter(id => id !== userId);
    saveJson(dataPath, data);

    const embed = new EmbedBuilder()
      .setDescription("❌ You left the giveaway")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    giveaway.entries.push(userId);
    saveJson(dataPath, data);

    const embed = new EmbedBuilder()
      .setDescription(`✅ You entered the giveaway\n**Total entries:** ${giveaway.entries.length}`)
      .setColor(0x57F287);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// End a giveaway manually
async function endGiveaway(interaction, data, dataPath) {
  const messageId = interaction.options.getString("message_id", true);

  const giveaway = data.giveaways?.find(g => g.message_id === messageId);

  if (!giveaway) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Giveaway not found! Make sure you're using the correct message ID.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (giveaway.ended) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This giveaway has already ended!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = await interaction.client.channels.fetch(giveaway.channel_id);
    const message = await channel.messages.fetch(giveaway.message_id);
    await finalizeGiveaway(message, giveaway, data, dataPath, interaction.client);

    const embed = new EmbedBuilder()
      .setDescription("✅ Giveaway ended successfully!")
      .setColor(0x57F287);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error ending giveaway:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to end giveaway. Make sure the message still exists.")
      .setColor(0xED4245);
    await interaction.editReply({ embeds: [embed] });
  }
}

// Reroll a giveaway
async function rerollGiveaway(interaction, data, dataPath) {
  const messageId = interaction.options.getString("message_id", true);
  const newWinners = interaction.options.getInteger("winners") || 1;

  const giveaway = data.giveaways?.find(g => g.message_id === messageId);

  if (!giveaway) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Giveaway not found!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (!giveaway.ended) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This giveaway hasn't ended yet! Use `/giveaway end` first.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();

  try {
    const channel = await interaction.client.channels.fetch(giveaway.channel_id);

    // Get fresh entries from reactions
    const message = await channel.messages.fetch(giveaway.message_id);
    const reaction = message.reactions.cache.get("🎉");
    let entries = [];

    if (reaction) {
      const users = await reaction.users.fetch();
      entries = users.filter(u => !u.bot).map(u => u.id);
    }

    if (entries.length === 0) {
      const embed = new EmbedBuilder()
        .setDescription("❌ No valid entries found!")
        .setColor(0xED4245);
      return interaction.editReply({ embeds: [embed] });
    }

    const winnersCount = Math.min(newWinners, entries.length);
    const winners = [];
    const entriesCopy = [...entries];

    for (let i = 0; i < winnersCount; i++) {
      const randomIndex = Math.floor(Math.random() * entriesCopy.length);
      winners.push(entriesCopy[randomIndex]);
      entriesCopy.splice(randomIndex, 1);
    }

    const winnerMentions = winners.map(id => `<@${id}>`).join(", ");

    const rerollEmbed = new EmbedBuilder()
      .setTitle("Giveaway Rerolled")
      .setDescription(
        `**Prize:** ${giveaway.prize}\n\n` +
        `**New Winner${winners.length !== 1 ? "s" : ""}:** ${winnerMentions}`
      )
      .setColor(0x57F287)
      .setTimestamp();

    await interaction.editReply({ content: winnerMentions, embeds: [rerollEmbed] });
  } catch (error) {
    console.error("Error rerolling giveaway:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to reroll giveaway!")
      .setColor(0xED4245);
    await interaction.editReply({ embeds: [embed] });
  }
}

// Finalize giveaway and pick winners
async function finalizeGiveaway(message, giveaway, data, dataPath, client) {
  giveaway.ended = true;

  // Get entries from reactions
  const reaction = message.reactions.cache.get("🎉");
  let entries = [];

  if (reaction) {
    const users = await reaction.users.fetch();
    entries = users.filter(u => !u.bot).map(u => u.id);
  }

  // Update entries in data
  giveaway.entries = entries;

  let winners = [];
  let winnerMentions = "No valid entries";

  if (entries.length > 0) {
    const winnersCount = Math.min(giveaway.winners, entries.length);
    const entriesCopy = [...entries];

    for (let i = 0; i < winnersCount; i++) {
      const randomIndex = Math.floor(Math.random() * entriesCopy.length);
      winners.push(entriesCopy[randomIndex]);
      entriesCopy.splice(randomIndex, 1);
    }

    winnerMentions = winners.map(id => `<@${id}>`).join(", ");
    giveaway.winner_ids = winners;
  }

  saveJson(dataPath, data);

  // Update the original message
  const endedEmbed = new EmbedBuilder()
    .setTitle(giveaway.prize)
    .setDescription(
      (giveaway.description ? `${giveaway.description}\n\n` : "") +
      `**Giveaway Ended**\n\n` +
      `**Winner${winners.length !== 1 ? "s" : ""}:** ${winnerMentions}\n` +
      `**Total Entries:** ${entries.length}\n` +
      `**Hosted by:** <@${giveaway.host_id}>`
    )
    .setColor(0x5865F2)
    .setAuthor({ name: "Giveaway Ended", iconURL: "https://cdn-icons-png.flaticon.com/512/3227/3227447.png" })
    .setFooter({ text: "Ended" })
    .setTimestamp();

  if (giveaway.image_url) endedEmbed.setImage(giveaway.image_url);

  await message.edit({ embeds: [endedEmbed], components: [] });

  // Announce winners
  if (winners.length > 0) {
    const winnerEmbed = new EmbedBuilder()
      .setTitle("Giveaway Winners")
      .setDescription(
        `**Prize:** ${giveaway.prize}\n\n` +
        `**Winner${winners.length !== 1 ? "s" : ""}:** ${winnerMentions}`
      )
      .setColor(0x57F287)
      .setTimestamp();

    await message.channel.send({ content: winnerMentions, embeds: [winnerEmbed] });
  } else {
    const noWinnerEmbed = new EmbedBuilder()
      .setTitle("Giveaway Ended")
      .setDescription(`**${giveaway.prize}**\n\nNo valid entries were recorded.`)
      .setColor(0xED4245)
      .setTimestamp();

    await message.channel.send({ embeds: [noWinnerEmbed] });
  }
}

// Check and end expired giveaways
async function checkGiveaways(client, data, dataPath) {
  if (!data.giveaways || data.giveaways.length === 0) return;

  const now = Date.now();
  const expiredGiveaways = data.giveaways.filter(g => !g.ended && g.end_time <= now);

  for (const giveaway of expiredGiveaways) {
    try {
      const channel = await client.channels.fetch(giveaway.channel_id);
      const message = await channel.messages.fetch(giveaway.message_id);
      await finalizeGiveaway(message, giveaway, data, dataPath, client);
      saveJson(dataPath, data);
    } catch (error) {
      console.error(`Failed to end giveaway ${giveaway.message_id}:`, error);
      // Mark as ended to prevent retrying
      giveaway.ended = true;
      saveJson(dataPath, data);
    }
  }
}

// List active giveaways
async function listGiveaways(interaction, data) {
  if (!data.giveaways || data.giveaways.length === 0) {
    const embed = new EmbedBuilder()
      .setDescription("No giveaways found in this server.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const activeGiveaways = data.giveaways.filter(g => !g.ended);
  const endedGiveaways = data.giveaways.filter(g => g.ended).slice(-5); // Last 5 ended

  const embed = new EmbedBuilder()
    .setTitle("Server Giveaways")
    .setColor(0xF59E42)
    .setAuthor({ name: "Giveaway Manager", iconURL: "https://cdn-icons-png.flaticon.com/512/3227/3227447.png" })
    .setTimestamp();

  if (activeGiveaways.length > 0) {
    const activeList = activeGiveaways.map((g, i) => {
      const timestamp = Math.floor(g.end_time / 1000);
      return `${i + 1}. **${g.prize}**\n   Ends <t:${timestamp}:R> • ${g.entries.length} entries\n   [Jump to Message](https://discord.com/channels/${g.guild_id}/${g.channel_id}/${g.message_id})`;
    }).join("\n\n");

    embed.addFields({
      name: `🎉 Active Giveaways (${activeGiveaways.length})`,
      value: activeList,
      inline: false
    });
  } else {
    embed.addFields({
      name: "🎉 Active Giveaways",
      value: "No active giveaways",
      inline: false
    });
  }

  if (endedGiveaways.length > 0) {
    const endedList = endedGiveaways.map(g => {
      const winners = g.winner_ids ? `${g.winner_ids.length} winner${g.winner_ids.length !== 1 ? "s" : ""}` : "No winners";
      return `• **${g.prize}** - ${winners}`;
    }).join("\n");


    embed.addFields({
      name: "📊 Recent Ended Giveaways",
      value: endedList,
      inline: false
    });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = {
  startGiveaway,
  handleGiveawayButton,
  endGiveaway,
  rerollGiveaway,
  checkGiveaways,
  listGiveaways,
};
