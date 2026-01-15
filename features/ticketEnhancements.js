const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require("discord.js");
const { saveJson } = require("../utils/fileManager");

// Set ticket priority
async function setTicketPriority(interaction, data, dataPath) {
  const ticket = data.tickets?.[interaction.channel.id];

  if (!ticket) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This is not a ticket channel!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const priority = interaction.options.getString("priority", true);

  ticket.priority = priority;
  ticket.priority_set_by = interaction.user.id;
  ticket.priority_set_at = new Date().toISOString();

  saveJson(dataPath, data);

  const priorityColors = {
    low: 0x57F287,
    medium: 0xFEE75C,
    high: 0xF59E42,
    urgent: 0xED4245
  };

  const priorityEmojis = {
    low: "🟢",
    medium: "🟡",
    high: "🟠",
    urgent: "🔴"
  };

  const embed = new EmbedBuilder()
    .setTitle("Priority Updated")
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Ticket priority has been set to **${priorityEmojis[priority]} ${priority.toUpperCase()}**`
    )
    .addFields(
      { name: "Set By", value: `${interaction.user}`, inline: true },
      { name: "Priority", value: `${priorityEmojis[priority]} ${priority.toUpperCase()}`, inline: true }
    )
    .setColor(priorityColors[priority])
    .setAuthor({ name: "Ticket Priority", iconURL: "https://cdn-icons-png.flaticon.com/512/5709/5709755.png" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  // Update channel name to reflect priority
  const channelName = interaction.channel.name;
  const priorityPrefix = `${priorityEmojis[priority]}-`;

  // Remove any existing priority emoji
  let newName = channelName.replace(/^[🟢🟡🟠🔴]-/, '');
  newName = priorityPrefix + newName;

  try {
    await interaction.channel.setName(newName);
  } catch (error) {
    console.error("Failed to update channel name:", error);
  }
}

// Add staff note to ticket
async function addTicketNote(interaction, data, dataPath) {
  const ticket = data.tickets?.[interaction.channel.id];

  if (!ticket) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This is not a ticket channel!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const note = interaction.options.getString("note", true);

  if (!ticket.notes) ticket.notes = [];

  ticket.notes.push({
    author_id: interaction.user.id,
    author_tag: interaction.user.tag,
    note: note,
    timestamp: new Date().toISOString()
  });

  saveJson(dataPath, data);

  const embed = new EmbedBuilder()
    .setTitle("Note Added")
    .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━\n${note}`)
    .addFields(
      { name: "Added By", value: `${interaction.user}`, inline: true },
      { name: "Total Notes", value: `${ticket.notes.length}`, inline: true }
    )
    .setColor(0x5865F2)
    .setAuthor({ name: "Staff Notes", iconURL: "https://cdn-icons-png.flaticon.com/512/2541/2541988.png" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// View ticket notes
async function viewTicketNotes(interaction, data) {
  const ticket = data.tickets?.[interaction.channel.id];

  if (!ticket) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This is not a ticket channel!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (!ticket.notes || ticket.notes.length === 0) {
    const embed = new EmbedBuilder()
      .setDescription("📝 No notes have been added to this ticket yet.")
      .setColor(0x5865F2);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const notesList = ticket.notes.map((note, i) => {
    const timestamp = Math.floor(new Date(note.timestamp).getTime() / 1000);
    return `**${i + 1}.** <@${note.author_id}> - <t:${timestamp}:R>\n${note.note}`;
  }).join("\n\n");

  const embed = new EmbedBuilder()
    .setTitle("Ticket Notes")
    .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━\n${notesList}`)
    .setColor(0x5865F2)
    .setAuthor({ name: "Staff Notes", iconURL: "https://cdn-icons-png.flaticon.com/512/2541/2541988.png" })
    .setFooter({ text: `${ticket.notes.length} note${ticket.notes.length !== 1 ? 's' : ''}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// Request ticket rating when closing
async function requestTicketRating(channel, ticket, user, config) {
  try {
    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_rate_${ticket.ticket_num}`)
        .setLabel("⭐ Rate Your Experience")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📝")
    );

    const embed = new EmbedBuilder()
      .setTitle("⭐ Rate Your Support Experience")
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**Ticket #${String(ticket.ticket_num).padStart(4, '0')}** has been closed.\n\n` +
        `Click the button below to rate your experience and optionally provide feedback!`
      )
      .addFields(
        { name: "📋 Category", value: ticket.category || "General", inline: true },
        { name: "⏱️ Response Time", value: ticket.claimed_by ? "Handled by staff" : "Unclaimed", inline: true }
      )
      .setColor(0xFEE75C)
      .setAuthor({ name: "Support Feedback", iconURL: "https://cdn-icons-png.flaticon.com/512/3588/3588257.png" })
      .setFooter({ text: "Your feedback helps us improve our service!" })
      .setTimestamp();

    if (config.logo_url) embed.setThumbnail(config.logo_url);

    await user.send({ embeds: [embed], components: [buttonRow] }).catch(() => {
      // If DM fails, send in channel
      channel.send({
        content: `${user}`,
        embeds: [embed],
        components: [buttonRow]
      }).catch(console.error);
    });
  } catch (error) {
    console.error("Error requesting ticket rating:", error);
  }
}

// Show rating modal when button clicked
async function showRatingModal(interaction, data) {
  const ticketNum = parseInt(interaction.customId.split('_')[2]);

  // Find ticket to check if it has a staff handler
  const ticket = (data.closed_tickets || []).find(t => t.ticket_num === ticketNum);
  const hasStaffHandler = ticket && ticket.claimed_by;

  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");

  const modal = new ModalBuilder()
    .setCustomId(`ticket_rating_modal_${ticketNum}`)
    .setTitle(`Rate Ticket #${String(ticketNum).padStart(4, '0')}`);

  // Ticket Rating input (1-5)
  const ratingInput = new TextInputBuilder()
    .setCustomId("rating")
    .setLabel("Ticket Rating (1-5 stars)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Enter 1, 2, 3, 4, or 5")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(1);

  // Staff Rating input (1-5) - only if ticket was claimed
  const staffRatingInput = new TextInputBuilder()
    .setCustomId("staff_rating")
    .setLabel("Staff Member Rating (1-5 stars)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Enter 1, 2, 3, 4, or 5")
    .setRequired(Boolean(hasStaffHandler))
    .setMinLength(1)
    .setMaxLength(1);

  // Feedback input (optional)
  const feedbackInput = new TextInputBuilder()
    .setCustomId("feedback")
    .setLabel("Feedback (Optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Tell us about your support experience...")
    .setRequired(false)
    .setMaxLength(1000);

  const ratingRow = new ActionRowBuilder().addComponents(ratingInput);
  const feedbackRow = new ActionRowBuilder().addComponents(feedbackInput);

  // Add staff rating row if ticket was claimed
  if (hasStaffHandler) {
    const staffRatingRow = new ActionRowBuilder().addComponents(staffRatingInput);
    modal.addComponents(ratingRow, staffRatingRow, feedbackRow);
  } else {
    modal.addComponents(ratingRow, feedbackRow);
  }

  await interaction.showModal(modal);
}

// Handle ticket rating modal submission
async function handleTicketRating(interaction, data, dataPath, config) {
  const ticketNum = parseInt(interaction.customId.split('_')[3]);
  const ratingText = interaction.fields.getTextInputValue("rating");
  const feedbackText = interaction.fields.getTextInputValue("feedback") || null;

  // Get staff rating if provided
  let staffRatingText = null;
  try {
    staffRatingText = interaction.fields.getTextInputValue("staff_rating");
  } catch (e) {
    // Staff rating not provided (ticket wasn't claimed)
  }

  // Validate ticket rating
  const rating = parseInt(ratingText);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Invalid ticket rating! Please enter a number between 1 and 5.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Validate staff rating if provided
  let staffRating = null;
  if (staffRatingText) {
    staffRating = parseInt(staffRatingText);
    if (isNaN(staffRating) || staffRating < 1 || staffRating > 5) {
      const embed = new EmbedBuilder()
        .setDescription("❌ Invalid staff rating! Please enter a number between 1 and 5.")
        .setColor(0xED4245);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }

  // Find the ticket in closed tickets history
  const ticket = (data.closed_tickets || []).find(t => t.ticket_num === ticketNum);

  if (!ticket) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Could not find your ticket! It may be too old.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Save ticket rating and feedback
  ticket.rating = rating;
  ticket.feedback = feedbackText;
  ticket.staff_rating = staffRating;
  ticket.rated_at = new Date().toISOString();

  // Track staff rating in staff_activity
  if (staffRating && ticket.claimed_by) {
    if (!data.staff_activity) data.staff_activity = {};
    if (!data.staff_activity[ticket.claimed_by]) {
      data.staff_activity[ticket.claimed_by] = {
        messages: 0,
        daily: {},
        weekly: {},
        monthly: {},
        first_tracked: new Date().toISOString(),
        last_active: new Date().toISOString(),
        streak: 0,
        longest_streak: 0,
        achievements: [],
        milestones: [],
        ticket_ratings: [],
        tickets_handled: 0
      };
    }

    const staffActivity = data.staff_activity[ticket.claimed_by];

    // Initialize ticket tracking if needed
    if (!staffActivity.ticket_ratings) staffActivity.ticket_ratings = [];
    if (!staffActivity.tickets_handled) staffActivity.tickets_handled = 0;

    // Add this rating
    staffActivity.ticket_ratings.push({
      rating: staffRating,
      ticket_num: ticketNum,
      date: new Date().toISOString()
    });

    staffActivity.tickets_handled++;
  }

  saveJson(dataPath, data);

  const stars = "⭐".repeat(rating);
  const staffStars = staffRating ? "⭐".repeat(staffRating) : null;
  const ratingLabels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  const embed = new EmbedBuilder()
    .setTitle("✅ Thank You for Your Feedback!")
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `**Ticket Rating:** ${stars} (${rating}/5 - ${ratingLabels[rating]})\n` +
      `${staffRating ? `**Staff Rating:** ${staffStars} (${staffRating}/5 - ${ratingLabels[staffRating]})\n` : ''}` +
      `${feedbackText ? `\n**Your Feedback:**\n${feedbackText}\n` : ''}` +
      `\nYour feedback helps us improve our support service!`
    )
    .setColor(0x57F287)
    .setAuthor({ name: "Feedback Received", iconURL: "https://cdn-icons-png.flaticon.com/512/3588/3588257.png" })
    .setFooter({ text: "Thank you for using our support system!" })
    .setTimestamp();

  if (config.logo_url) embed.setThumbnail(config.logo_url);

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  // Send rating to ratings channel (or fall back to log channel)
  const ratingsChannelId = config.ticket_ratings_channel_id || config.ticket_log_channel_id;
  if (ratingsChannelId) {
    const ratingsChannel = interaction.client.channels.cache.get(ratingsChannelId);
    if (ratingsChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle(`⭐ Support Rating - Ticket #${String(ticket.ticket_num).padStart(4, '0')}`)
        .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━`)
        .addFields(
          { name: "👤 User", value: `<@${ticket.user_id}>`, inline: true },
          { name: "⭐ Ticket Rating", value: `${stars} (${rating}/5)`, inline: true },
          { name: "📊 Quality", value: ratingLabels[rating], inline: true },
          { name: "📋 Category", value: ticket.category || "General", inline: true },
          { name: "✋ Handled By", value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Unclaimed", inline: true },
          { name: "📅 Rated", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setColor(rating >= 4 ? 0x57F287 : rating >= 3 ? 0xFEE75C : 0xED4245)
        .setAuthor({ name: "Ticket Feedback System", iconURL: "https://cdn-icons-png.flaticon.com/512/3588/3588257.png" })
        .setTimestamp();

      // Add staff rating if provided
      if (staffRating) {
        logEmbed.addFields({ name: "👨‍💼 Staff Rating", value: `${staffStars} (${staffRating}/5 - ${ratingLabels[staffRating]})`, inline: false });
      }

      if (feedbackText) {
        logEmbed.addFields({ name: "💬 Feedback", value: feedbackText, inline: false });
        logEmbed.setFooter({ text: staffRating ? "Complete feedback with staff rating" : "Complete feedback received" });
      } else {
        logEmbed.setFooter({ text: staffRating ? "Staff rating received" : "No written feedback provided" });
      }

      if (config.logo_url) logEmbed.setThumbnail(config.logo_url);

      await ratingsChannel.send({ embeds: [logEmbed] });
    }
  }
}

// Auto-close inactive tickets
async function checkInactiveTickets(client, data, dataPath, config) {
  if (!data.tickets || !config.autoclose_tickets) return;

  const inactivityThreshold = config.ticket_inactivity_hours || 48; // hours
  const thresholdMs = inactivityThreshold * 60 * 60 * 1000;
  const now = Date.now();

  for (const [channelId, ticket] of Object.entries(data.tickets)) {
    if (ticket.closed) continue;

    // Skip if no messages or ticket is too new
    if (!ticket.last_message_at) continue;

    const lastMessageTime = new Date(ticket.last_message_at).getTime();
    const inactiveDuration = now - lastMessageTime;

    if (inactiveDuration >= thresholdMs) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) continue;

        const embed = new EmbedBuilder()
          .setTitle("Ticket Auto-Closed")
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `This ticket has been automatically closed due to inactivity.\n\n` +
            `**Inactive for:** ${Math.floor(inactiveDuration / (1000 * 60 * 60))} hours\n` +
            `**Threshold:** ${inactivityThreshold} hours\n\n` +
            `Channel will be deleted in 10 seconds.`
          )
          .setColor(0xFEE75C)
          .setAuthor({ name: "Auto-Close System", iconURL: "https://cdn-icons-png.flaticon.com/512/1828/1828479.png" })
          .setTimestamp();

        await channel.send({ embeds: [embed] });

        // Import closeTicket from tickets_v2
        const { closeTicket } = require("./tickets_v2");

        setTimeout(async () => {
          await closeTicket(channel, client.user, config, data, dataPath);
        }, 10000);

        ticket.auto_closed = true;
        saveJson(dataPath, data);
      } catch (error) {
        console.error(`Error auto-closing ticket ${channelId}:`, error);
      }
    }
  }
}

// Update last message time for ticket
function updateTicketActivity(channelId, data, dataPath) {
  const ticket = data.tickets?.[channelId];
  if (!ticket || ticket.closed) return;

  ticket.last_message_at = new Date().toISOString();
  saveJson(dataPath, data);
}

// Toggle auto-close
async function toggleAutoClose(interaction, config, configPath) {
  const enabled = interaction.options.getBoolean("enabled", true);
  const hours = interaction.options.getInteger("hours") || 48;

  config.autoclose_tickets = enabled;
  config.ticket_inactivity_hours = hours;

  saveJson(configPath, config);

  const embed = new EmbedBuilder()
    .setTitle("Auto-Close Configuration")
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Auto-close has been **${enabled ? "enabled" : "disabled"}**.`
    )
    .addFields(
      { name: "Status", value: enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
      { name: "Threshold", value: `${hours} hours`, inline: true }
    )
    .setColor(enabled ? 0x57F287 : 0xED4245)
    .setAuthor({ name: "Ticket System", iconURL: "https://cdn-icons-png.flaticon.com/512/3126/3126647.png" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// View ticket stats
async function viewTicketStats(interaction, data, config) {
  const tickets = Object.values(data.tickets || {});

  if (tickets.length === 0) {
    const embed = new EmbedBuilder()
      .setDescription("📊 No ticket data available yet!")
      .setColor(0x5865F2);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => !t.closed).length;
  const closedTickets = tickets.filter(t => t.closed).length;

  // Rating stats
  const ratedTickets = tickets.filter(t => t.rating);
  const avgRating = ratedTickets.length > 0
    ? (ratedTickets.reduce((sum, t) => sum + t.rating, 0) / ratedTickets.length).toFixed(1)
    : "N/A";

  // Priority breakdown
  const priorities = {
    urgent: tickets.filter(t => t.priority === "urgent").length,
    high: tickets.filter(t => t.priority === "high").length,
    medium: tickets.filter(t => t.priority === "medium").length,
    low: tickets.filter(t => t.priority === "low").length,
    none: tickets.filter(t => !t.priority).length
  };

  const embed = new EmbedBuilder()
    .setTitle("Ticket System Statistics")
    .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━`)
    .addFields(
      { name: "📊 Total Tickets", value: `${totalTickets}`, inline: true },
      { name: "🟢 Open", value: `${openTickets}`, inline: true },
      { name: "🔒 Closed", value: `${closedTickets}`, inline: true },
      { name: "\u200b", value: "━━━━━━━━━━━━━━━━━━━━━━━━━", inline: false },
      { name: "⭐ Average Rating", value: `${avgRating}/5`, inline: true },
      { name: "📝 Rated Tickets", value: `${ratedTickets.length}/${closedTickets}`, inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "\u200b", value: "━━━━━━━━━━━━━━━━━━━━━━━━━", inline: false },
      { name: "Priority Breakdown", value: `🔴 Urgent: ${priorities.urgent}\n🟠 High: ${priorities.high}\n🟡 Medium: ${priorities.medium}\n🟢 Low: ${priorities.low}\n⚪ None: ${priorities.none}`, inline: false }
    )
    .setColor(0x5865F2)
    .setAuthor({ name: "Ticket Analytics", iconURL: "https://cdn-icons-png.flaticon.com/512/3050/3050155.png" })
    .setTimestamp();

  if (config.logo_url) embed.setThumbnail(config.logo_url);

  await interaction.reply({ embeds: [embed] });
}

// Rename ticket channel
async function renameTicket(interaction, data, dataPath) {
  const ticket = data.tickets?.[interaction.channel.id];

  if (!ticket) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This is not a ticket channel!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const newName = interaction.options.getString("name", true);

  // Sanitize the name (remove special chars, lowercase, etc)
  const sanitizedName = newName.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 50);

  if (!sanitizedName || sanitizedName.length < 3) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Ticket name must be at least 3 characters and contain alphanumeric characters!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Keep ticket number for tracking
  const ticketNum = String(ticket.ticket_num).padStart(4, '0');
  const finalName = `ticket-${sanitizedName}-${ticketNum}`;
  const oldName = interaction.channel.name; // Store old name before changing

  try {
    await interaction.channel.setName(finalName);

    const embed = new EmbedBuilder()
      .setTitle("Ticket Renamed")
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Ticket channel has been renamed successfully.`
      )
      .addFields(
        { name: "Old Name", value: oldName, inline: true },
        { name: "New Name", value: finalName, inline: true },
        { name: "Renamed By", value: `${interaction.user}`, inline: false }
      )
      .setColor(0x57F287)
      .setAuthor({ name: "Ticket Management", iconURL: "https://cdn-icons-png.flaticon.com/512/3126/3126647.png" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error renaming ticket:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to rename ticket. Please check bot permissions or try a different name.")
      .setColor(0xED4245);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Set ratings channel
async function setRatingsChannel(interaction, config, configPath) {
  const channel = interaction.options.getChannel("channel", true);

  config.ticket_ratings_channel_id = channel.id;
  const { saveJson } = require("../utils/fileManager");
  saveJson(configPath, config);

  const embed = new EmbedBuilder()
    .setTitle("✅ Ratings Channel Configured")
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Ticket ratings will now be sent to ${channel}.\n\n` +
      `All future ticket feedback will appear in this channel with detailed information including optional written feedback.`
    )
    .addFields(
      { name: "📍 Channel", value: `${channel}`, inline: true },
      { name: "🎯 Purpose", value: "Support ratings & feedback", inline: true }
    )
    .setColor(0x57F287)
    .setAuthor({ name: "Ticket Configuration", iconURL: "https://cdn-icons-png.flaticon.com/512/3126/3126647.png" })
    .setFooter({ text: "Users can submit ratings with optional feedback" })
    .setTimestamp();

  if (config.logo_url) embed.setThumbnail(config.logo_url);

  await interaction.reply({ embeds: [embed] });
}

// Add user to ticket
async function addUserToTicket(interaction, data, dataPath, config) {
  const ticket = data.tickets?.[interaction.channel.id];

  if (!ticket) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This is not a ticket channel!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const userToAdd = interaction.options.getUser("user", true);

  // Check if user is already in ticket
  if (!ticket.added_users) {
    ticket.added_users = [];
  }

  if (userToAdd.id === ticket.user_id) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This user is already the ticket creator!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (ticket.added_users.includes(userToAdd.id)) {
    const embed = new EmbedBuilder()
      .setDescription(`❌ ${userToAdd} is already in this ticket!`)
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Add user to ticket data
  ticket.added_users.push(userToAdd.id);

  // Add note about user being added
  if (!ticket.notes) ticket.notes = [];
  ticket.notes.push({
    author_id: interaction.user.id,
    author_tag: interaction.user.tag,
    note: `Added ${userToAdd.tag} to ticket`,
    timestamp: new Date().toISOString()
  });

  saveJson(dataPath, data);

  // Update channel permissions
  try {
    await interaction.channel.permissionOverwrites.create(userToAdd.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true
    });

    const embed = new EmbedBuilder()
      .setTitle("User Added")
      .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ ${userToAdd} has been added to this ticket.`)
      .setColor(0x57F287)
      .setFooter({ text: `Added by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Send notification in ticket
    const notifEmbed = new EmbedBuilder()
      .setDescription(`👋 ${userToAdd} has been added to this ticket by ${interaction.user}`)
      .setColor(0x5865F2);
    await interaction.channel.send({ embeds: [notifEmbed] });

  } catch (error) {
    console.error("Error adding user to ticket:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to add user to ticket. Please check permissions.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Remove user from ticket
async function removeUserFromTicket(interaction, data, dataPath, config) {
  const ticket = data.tickets?.[interaction.channel.id];

  if (!ticket) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This is not a ticket channel!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const userToRemove = interaction.options.getUser("user", true);

  if (!ticket.added_users || !ticket.added_users.includes(userToRemove.id)) {
    const embed = new EmbedBuilder()
      .setDescription(`❌ ${userToRemove} is not in this ticket!`)
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (userToRemove.id === ticket.user_id) {
    const embed = new EmbedBuilder()
      .setDescription("❌ You cannot remove the ticket creator!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Remove user from ticket data
  ticket.added_users = ticket.added_users.filter(id => id !== userToRemove.id);

  // Add note about user being removed
  if (!ticket.notes) ticket.notes = [];
  ticket.notes.push({
    author_id: interaction.user.id,
    author_tag: interaction.user.tag,
    note: `Removed ${userToRemove.tag} from ticket`,
    timestamp: new Date().toISOString()
  });

  saveJson(dataPath, data);

  // Update channel permissions
  try {
    await interaction.channel.permissionOverwrites.delete(userToRemove.id);

    const embed = new EmbedBuilder()
      .setTitle("User Removed")
      .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ ${userToRemove} has been removed from this ticket.`)
      .setColor(0x57F287)
      .setFooter({ text: `Removed by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error("Error removing user from ticket:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to remove user from ticket. Please check permissions.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// List ticket participants
async function listTicketParticipants(interaction, data, dataPath) {
  const ticket = data.tickets?.[interaction.channel.id];

  if (!ticket) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This is not a ticket channel!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const creator = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
  let description = `━━━━━━━━━━━━━━━━━━━━━━━━━\n**👤 Ticket Creator**\n${creator ? `<@${ticket.user_id}>` : ticket.user_tag}\n\n`;

  if (ticket.claimed_by) {
    const claimer = await interaction.client.users.fetch(ticket.claimed_by).catch(() => null);
    description += `**🎫 Claimed By**\n${claimer ? `<@${ticket.claimed_by}>` : 'Unknown'}\n\n`;
  }

  if (ticket.added_users && ticket.added_users.length > 0) {
    description += `**➕ Added Users (${ticket.added_users.length})**\n`;
    for (const userId of ticket.added_users) {
      description += `<@${userId}>\n`;
    }
  } else {
    description += `**➕ Added Users**\nNone`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Ticket #${ticket.ticket_num} - Participants`)
    .setDescription(description)
    .setColor(0x5865F2)
    .setFooter({ text: `Category: ${ticket.category}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = {
  setTicketPriority,
  addTicketNote,
  viewTicketNotes,
  requestTicketRating,
  showRatingModal,
  handleTicketRating,
  checkInactiveTickets,
  updateTicketActivity,
  toggleAutoClose,
  viewTicketStats,
  renameTicket,
  setRatingsChannel,
  addUserToTicket,
  removeUserFromTicket,
  listTicketParticipants
};
