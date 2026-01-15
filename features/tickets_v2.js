const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const { saveJson } = require("../utils/fileManager");

// Default ticket panel configuration
const DEFAULT_PANEL = {
  title: "Support Tickets",
  description: "Click a button below to open a support ticket. A private channel will be created for you.",
  color: 0x5865F2,
  footer: "Click a button to create a ticket",
  thumbnail: null,
  image: null,
  buttons: [
    {
      id: "general",
      label: "General Support",
      emoji: "📋",
      style: "Primary",
      description: "General questions and assistance"
    },
    {
      id: "bug",
      label: "Bug Report",
      emoji: "🐛",
      style: "Danger",
      description: "Report bugs or issues"
    },
    {
      id: "account",
      label: "Account Suggestion",
      emoji: "💡",
      style: "Success",
      description: "Account suggestions"
    },
    {
      id: "other",
      label: "Other",
      emoji: "📁",
      style: "Secondary",
      description: "Anything else"
    }
  ]
};

// Get panel config or create default
function getPanelConfig(config) {
  if (!config.ticket_panel) {
    config.ticket_panel = DEFAULT_PANEL;
  }
  return config.ticket_panel;
}

// Create ticket panel embed
async function createTicketPanel(interaction, config, configPath) {
  const panel = getPanelConfig(config);
  saveJson(configPath, config);

  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(panel.description + "\n━━━━━━━━━━━━━━━━━━━━━━━━━")
    .setColor(panel.color)
    .setAuthor({ name: "Support System", iconURL: "https://cdn-icons-png.flaticon.com/512/3126/3126647.png" })
    .setFooter({ text: panel.footer })
    .setTimestamp();

  if (panel.thumbnail) embed.setThumbnail(panel.thumbnail);
  if (panel.image) embed.setImage(panel.image);
  if (config.logo_url) embed.setThumbnail(config.logo_url);

  // Create button rows (max 5 buttons per row)
  const buttons = panel.buttons.map(btn =>
    new ButtonBuilder()
      .setCustomId(`ticket_${btn.id}`)
      .setLabel(btn.label)
      .setStyle(ButtonStyle[btn.style])
      .setEmoji(btn.emoji)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  await interaction.channel.send({ embeds: [embed], components: rows });

  const successEmbed = new EmbedBuilder()
    .setDescription("✅ Ticket panel created successfully!")
    .setColor(0x57F287);

  await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
}

// Create ticket from button
async function createTicketFromButton(interaction, category, config, data, dataPath) {
  if (!config.ticket_category_id) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Ticket system is not configured! Ask an admin to run `/ticketsetup` first.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Check if user already has an open ticket
  const existingTicket = Object.values(data.tickets || {}).find(
    t => t.user_id === interaction.user.id && !t.closed
  );

  if (existingTicket) {
    const channelId = Object.keys(data.tickets).find(
      k => data.tickets[k].user_id === interaction.user.id && !data.tickets[k].closed
    );
    const embed = new EmbedBuilder()
      .setDescription(`❌ You already have an open ticket: <#${channelId}>`)
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Validate category exists and is actually a category
  const ticketCategory = interaction.guild.channels.cache.get(config.ticket_category_id);

  if (!ticketCategory) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Ticket category not found! Please run `/ticketsetup channels` again with a valid category.")
      .setColor(0xED4245);
    return interaction.editReply({ embeds: [embed] });
  }

  if (ticketCategory.type !== ChannelType.GuildCategory) {
    const embed = new EmbedBuilder()
      .setDescription(`❌ The configured channel ${ticketCategory} is not a category! Please run \`/ticketsetup channels\` with an actual category channel.`)
      .setColor(0xED4245);
    return interaction.editReply({ embeds: [embed] });
  }

  data.ticket_counter = (data.ticket_counter || 0) + 1;
  const ticketNum = data.ticket_counter;

  // Create username-based channel name (sanitized)
  const username = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const channelName = `ticket-${username}-${String(ticketNum).padStart(4, '0')}`;

  try {
    // Build permission overwrites
    const permissionOverwrites = [
      {
        id: interaction.guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
    ];

    // Add staff roles - convert to string and verify they exist
    for (const roleId of (config.staff_role_ids || [])) {
      const role = interaction.guild.roles.cache.get(String(roleId));
      if (role) {
        permissionOverwrites.push({
          id: String(roleId),
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.EmbedLinks,
          ],
        });
      }
    }

    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: ticketCategory?.id,
      permissionOverwrites,
      topic: `Ticket #${ticketNum} | User: ${interaction.user.tag} | Category: ${category}`,
    });

    data.tickets[channel.id] = {
      ticket_num: ticketNum,
      user_id: interaction.user.id,
      user_tag: interaction.user.tag,
      category: category,
      created_at: new Date().toISOString(),
      claimed_by: null,
      closed: false,
      messages: [],
    };
    saveJson(dataPath, data);

    // Get button config for category name
    const panel = getPanelConfig(config);
    const buttonConfig = panel.buttons.find(b => b.id === category);
    const categoryName = buttonConfig ? buttonConfig.label : category;

    const embed = new EmbedBuilder()
      .setTitle(`Ticket #${String(ticketNum).padStart(4, '0')}`)
      .setDescription(
        `${interaction.user} - A staff member will assist you shortly.\n` +
        `Please describe your issue below.\n━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .addFields(
        { name: "📋 Category", value: categoryName, inline: true },
        { name: "🕒 Opened", value: `<t:${Math.floor(Date.parse(data.tickets[channel.id].created_at) / 1000)}:R>`, inline: true },
        { name: "👤 User", value: `${interaction.user.tag}`, inline: true }
      )
      .setColor(0x5865F2)
      .setAuthor({ name: "New Support Ticket", iconURL: "https://cdn-icons-png.flaticon.com/512/3126/3126647.png" })
      .setFooter({ text: "Use the buttons below to manage this ticket" })
      .setTimestamp();

    if (config.logo_url) embed.setThumbnail(config.logo_url);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("Claim Ticket")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✋"),
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒")
    );

    // Ping staff roles
    const staffPings = (config.staff_role_ids || [])
      .map(id => `<@&${id}>`)
      .join(' ');

    await channel.send({
      content: `${interaction.user} ${staffPings}`.trim(),
      embeds: [embed],
      components: [row]
    });

    const successEmbed = new EmbedBuilder()
      .setDescription(`✅ Ticket created successfully! ${channel}`)
      .setColor(0x57F287);

    await interaction.editReply({ embeds: [successEmbed] });
  } catch (error) {
    console.error("Error creating ticket:", error);
    const errorEmbed = new EmbedBuilder()
      .setDescription("❌ Failed to create ticket. Please contact an administrator.")
      .setColor(0xED4245);
    await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
  }
}

async function handleClaim(interaction, data, dataPath, config) {
  const ticket = data.tickets[interaction.channel.id];
  if (!ticket) return;

  if (ticket.claimed_by) {
    const embed = new EmbedBuilder()
      .setDescription(`❌ This ticket is already claimed by <@${ticket.claimed_by}>!`)
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  ticket.claimed_by = interaction.user.id;
  ticket.claimed_at = new Date().toISOString();
  saveJson(dataPath, data);

  const embed = new EmbedBuilder()
    .setTitle("Ticket Claimed")
    .setDescription(
      `${interaction.user} has claimed this ticket and will provide support.\n━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      { name: "👤 Claimed By", value: `${interaction.user}`, inline: true },
      { name: "🕒 Claimed", value: `<t:${Math.floor(Date.parse(ticket.claimed_at) / 1000)}:R>`, inline: true }
    )
    .setColor(0x57F287)
    .setAuthor({ name: "Ticket Update", iconURL: "https://cdn-icons-png.flaticon.com/512/5290/5290058.png" })
    .setTimestamp();

  if (config.logo_url) embed.setThumbnail(config.logo_url);

  await interaction.reply({ embeds: [embed] });
}

async function handleClose(interaction, config, data, dataPath) {
  const ticket = data.tickets[interaction.channel.id];
  if (!ticket) return;

  // Show confirmation dialog
  const confirmEmbed = new EmbedBuilder()
    .setTitle("⚠️ Close Ticket Confirmation")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "Are you sure you want to close this ticket?\n\n" +
      "**This will:**\n" +
      "• Delete the channel permanently\n" +
      "• Send a transcript to the ticket creator\n" +
      "• Log the ticket in the ticket log channel\n\n" +
      "**This action cannot be undone.**"
    )
    .setColor(0xFEE75C)
    .setAuthor({ name: "Ticket System", iconURL: "https://cdn-icons-png.flaticon.com/512/1828/1828479.png" })
    .setFooter({ text: `Ticket #${ticket.ticket_num}` })
    .setTimestamp();

  const confirmRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_close_confirm")
        .setLabel("Yes, Close Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId("ticket_close_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌")
    );

  await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
}

// Handle close confirmation
async function handleCloseConfirm(interaction, config, data, dataPath) {
  const ticket = data.tickets[interaction.channel.id];
  if (!ticket) return;

  const embed = new EmbedBuilder()
    .setTitle("Ticket Closing")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "This ticket is being closed.\n\n" +
      "**Channel will be deleted in 5 seconds.**\n" +
      "Transcript will be sent to the ticket creator's DMs."
    )
    .setColor(0xFEE75C)
    .setAuthor({ name: "Ticket System", iconURL: "https://cdn-icons-png.flaticon.com/512/1828/1828479.png" })
    .setFooter({ text: "Thank you for using our support system" })
    .setTimestamp();

  // Update the original ephemeral message
  await interaction.update({ embeds: [new EmbedBuilder().setDescription("✅ Ticket is being closed...").setColor(0x57F287)], components: [] });

  // Send public message
  await interaction.channel.send({ embeds: [embed] });

  setTimeout(async () => {
    await closeTicket(interaction.channel, interaction.user, config, data, dataPath);
  }, 5000);
}

// Handle close cancellation
async function handleCloseCancel(interaction) {
  const cancelEmbed = new EmbedBuilder()
    .setDescription("❌ Ticket close cancelled.")
    .setColor(0x5865F2);

  await interaction.update({ embeds: [cancelEmbed], components: [] });
}

async function closeTicket(channel, closedBy, config, data, dataPath) {
  const ticket = data.tickets[channel.id];
  if (!ticket) return null;

  ticket.closed = true;
  ticket.closed_by = closedBy.id;
  ticket.closed_at = new Date().toISOString();

  // Fetch recent messages for transcript (last 100 messages)
  let messages = [];
  try {
    const fetchedMessages = await channel.messages.fetch({ limit: 100 });
    messages = Array.from(fetchedMessages.values()).reverse();
  } catch (error) {
    console.error("Error fetching messages for transcript:", error);
  }

  // Create detailed transcript
  const createdDate = new Date(ticket.created_at);
  const closedDate = new Date(ticket.closed_at);
  const duration = formatDuration(closedDate - createdDate);

  // Generate HTML transcript
  const { generateHTMLTranscript } = require("../utils/transcriptGenerator");
  const htmlTranscript = generateHTMLTranscript(ticket, messages, closedBy, config);
  const htmlBuffer = Buffer.from(htmlTranscript, "utf-8");
  const htmlFileName = `ticket-${ticket.user_tag.replace(/[^a-z0-9]/gi, '-')}-${String(ticket.ticket_num).padStart(4, '0')}.html`;

  // Also create text transcript as backup
  let transcript = `═══════════════════════════════════════════════════════\n`;
  transcript += `TICKET TRANSCRIPT #${String(ticket.ticket_num).padStart(4, '0')}\n`;
  transcript += `═══════════════════════════════════════════════════════\n\n`;
  transcript += `Ticket Information:\n`;
  transcript += `  Ticket #: ${ticket.ticket_num}\n`;
  transcript += `  Opened by: ${ticket.user_tag} (${ticket.user_id})\n`;
  transcript += `  Category: ${ticket.category}\n`;
  transcript += `  Created: ${createdDate.toLocaleString()}\n`;
  transcript += `  Closed: ${closedDate.toLocaleString()}\n`;
  transcript += `  Duration: ${duration}\n`;
  transcript += `  Claimed by: ${ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Unclaimed"}\n`;
  transcript += `  Closed by: ${closedBy.tag} (${closedBy.id})\n`;
  transcript += `  Total Messages: ${messages.length}\n\n`;
  transcript += `${"=".repeat(60)}\n\n`;

  // Add all messages
  for (const msg of messages) {
    const timestamp = msg.createdAt.toLocaleTimeString();
    const author = msg.author.tag;
    transcript += `[${timestamp}] ${author}:\n`;
    if (msg.content) transcript += `${msg.content}\n`;
    if (msg.attachments.size > 0) {
      transcript += `Attachments: ${msg.attachments.map(a => a.url).join(", ")}\n`;
    }
    transcript += `\n`;
  }

  transcript += `\n${"=".repeat(60)}\n`;
  transcript += `End of transcript\n`;

  const textBuffer = Buffer.from(transcript, "utf-8");
  const textFileName = `ticket-${ticket.user_tag.replace(/[^a-z0-9]/gi, '-')}-${String(ticket.ticket_num).padStart(4, '0')}.txt`;

  // Send to log channel
  if (config.ticket_log_channel_id) {
    const logChannel = channel.guild.channels.cache.get(config.ticket_log_channel_id);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle(`📋 Ticket Closed - #${String(ticket.ticket_num).padStart(4, '0')}`)
        .setDescription(
          `**User:** ${ticket.user_tag}\n**Category:** ${ticket.category}\n━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .addFields(
          { name: "👤 User", value: `<@${ticket.user_id}>`, inline: true },
          { name: "⏱️ Duration", value: duration, inline: true },
          { name: "💬 Messages", value: `${messages.length}`, inline: true },
          { name: "✋ Handled By", value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Unclaimed", inline: true },
          { name: "🔒 Closed By", value: `${closedBy}`, inline: true },
          { name: "\u200b", value: "\u200b", inline: true },
          { name: "📅 Opened", value: `<t:${Math.floor(createdDate / 1000)}:R>`, inline: true },
          { name: "📅 Closed", value: `<t:${Math.floor(closedDate / 1000)}:R>`, inline: true },
          { name: "\u200b", value: "\u200b", inline: true }
        )
        .setColor(0x5865F2)
        .setAuthor({ name: "Ticket Log", iconURL: "https://cdn-icons-png.flaticon.com/512/3094/3094840.png" })
        .setFooter({ text: "📄 HTML & TXT transcripts attached • Open .html in browser" })
        .setTimestamp();

      if (config.logo_url) embed.setThumbnail(config.logo_url);

      await logChannel.send({
        embeds: [embed],
        files: [
          { attachment: htmlBuffer, name: htmlFileName },
          { attachment: textBuffer, name: textFileName }
        ]
      });
    }
  }

  // Try to DM the user the transcript
  let user;
  try {
    user = await channel.client.users.fetch(ticket.user_id);
    const dmEmbed = new EmbedBuilder()
      .setTitle(`Ticket Closed - #${String(ticket.ticket_num).padStart(4, '0')}`)
      .setDescription(
        `Your ticket in **${channel.guild.name}** has been closed.\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Your transcript is attached below for your records.`
      )
      .addFields(
        { name: "⏱️ Duration", value: duration, inline: true },
        { name: "💬 Messages", value: `${messages.length}`, inline: true },
        { name: "✋ Handled By", value: closedBy.tag, inline: false }
      )
      .setColor(0x57F287)
      .setAuthor({ name: "Support Ticket", iconURL: "https://cdn-icons-png.flaticon.com/512/3126/3126647.png" })
      .setFooter({ text: "Thank you for contacting support" })
      .setTimestamp();

    if (config.logo_url) dmEmbed.setThumbnail(config.logo_url);

    await user.send({
      embeds: [dmEmbed],
      files: [
        { attachment: htmlBuffer, name: htmlFileName },
        { attachment: textBuffer, name: textFileName }
      ]
    });
  } catch (error) {
    console.log(`Could not DM transcript to user ${ticket.user_id}:`, error.message);
  }

  // Store closed ticket in history for ratings (initialize if needed)
  if (!data.closed_tickets) {
    data.closed_tickets = [];
  }

  // Add to closed tickets history (keep last 100)
  data.closed_tickets.unshift(ticket);
  if (data.closed_tickets.length > 100) {
    data.closed_tickets = data.closed_tickets.slice(0, 100);
  }

  // Remove from active tickets
  delete data.tickets[channel.id];
  saveJson(dataPath, data);

  // Request ticket rating (only if user was fetched successfully)
  if (user) {
    const { requestTicketRating } = require("./ticketEnhancements");
    await requestTicketRating(channel, ticket, user, config);
  }

  await channel.delete().catch(console.error);
  return ticket;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function logTicketMessage(message, data, dataPath) {
  if (data.tickets[message.channel.id]) {
    data.tickets[message.channel.id].messages.push({
      author: message.author.tag,
      content: message.content,
      timestamp: new Date().toISOString(),
    });
    saveJson(dataPath, data);
  }
}

module.exports = {
  createTicketPanel,
  createTicketFromButton,
  handleClaim,
  handleClose,
  handleCloseConfirm,
  handleCloseCancel,
  closeTicket,
  logTicketMessage,
  getPanelConfig,
  DEFAULT_PANEL,
};
