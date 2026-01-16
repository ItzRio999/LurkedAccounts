const {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const path = require("path");
const { isOwnerOrCoowner } = require("../utils/permissions");
const { saveJson, addLogo } = require("../utils/fileManager");
const { createTicketPanel, createTicketFromButton, handleClaim, handleClose, handleCloseConfirm, handleCloseCancel, getPanelConfig, DEFAULT_PANEL } = require("../features/tickets_v2");
const { showStaffReport, showStaffStats } = require("../features/staffTracking_v2");
const { showBoostReport, showBoostLog, showCurrentBoosters } = require("../features/boostTracking");
const { createPoll } = require("../features/polls");
const { nukeMessages, timeoutUser, untimeoutUser, kickUser, banUser, softbanUser, unbanUser } = require("../features/moderation");
const { createRolesPanel, handleRoleButton, getRolesPanelConfig } = require("../features/rolesPanel");
const { announceMovie, handleMovieButton, showSchedule, addToSchedule, removeFromSchedule, showStats, showVolumeHelp, createMoviePoll } = require("../features/movieNight");
const { startGiveaway, handleGiveawayButton, endGiveaway, rerollGiveaway, listGiveaways } = require("../features/giveaways");
const { configureAutomod, getUserStrikes, removeUserStrikes, removeAllStrikes } = require("../features/automod");
const { setTicketPriority, addTicketNote, viewTicketNotes, showRatingModal, handleTicketRating, toggleAutoClose, viewTicketStats, renameTicket, setRatingsChannel, addUserToTicket, removeUserFromTicket, listTicketParticipants } = require("../features/ticketEnhancements");

async function handleInteraction(interaction, config, data, configPath, dataPath) {
  const buildDiscordAuthUrl = () => {
    const redirectUri =
      process.env.DISCORD_REDIRECT_URI || "https://lurkedaccounts.tech/auth/discord/callback";
    const params = new URLSearchParams({
      client_id: config.client_id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify email guilds",
    });
    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  };
  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("ticket_rating_modal_")) {
      return handleTicketRating(interaction, data, dataPath, config);
    }
    return;
  }

  // Handle button interactions
  if (interaction.isButton()) {
    // Ticket panel buttons
    if (interaction.customId.startsWith("ticket_")) {
      if (interaction.customId === "ticket_claim") {
        return handleClaim(interaction, data, dataPath, config);
      } else if (interaction.customId === "ticket_close") {
        return handleClose(interaction, config, data, dataPath);
      } else if (interaction.customId === "ticket_close_confirm") {
        return handleCloseConfirm(interaction, config, data, dataPath);
      } else if (interaction.customId === "ticket_close_cancel") {
        return handleCloseCancel(interaction);
      } else if (interaction.customId.startsWith("ticket_rate_")) {
        return showRatingModal(interaction, data);
      } else {
        // Category buttons (ticket_general, ticket_bug, etc.)
        const category = interaction.customId.replace("ticket_", "");
        return createTicketFromButton(interaction, category, config, data, dataPath);
      }
    }

    // Roles panel buttons
    if (interaction.customId.startsWith("role_")) {
      const roleId = interaction.customId.replace("role_", "");
      return handleRoleButton(interaction, roleId, config);
    }

    // Movie night buttons
    if (interaction.customId.startsWith("movie_")) {
      const buttonType = interaction.customId.replace("movie_", "");
      return handleMovieButton(interaction, buttonType, data, dataPath);
    }

    // Giveaway buttons
    if (interaction.customId === "giveaway_enter") {
      return handleGiveawayButton(interaction, data, dataPath);
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) {
    const embed = addLogo(
      new EmbedBuilder()
        .setDescription("❌ This command can only be used in a server!")
        .setColor(0xED4245),
      config
    );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const member = interaction.member;
  const name = interaction.commandName;

  // ============== QUICK SETUP ==============
  if (name === "quicksetup") {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "tickets") {
      const { ChannelType } = require("discord.js");
      const category = interaction.options.getChannel("category", true);
      const logChannel = interaction.options.getChannel("logchannel", true);
      const title = interaction.options.getString("title");
      const color = interaction.options.getString("color");

      // Validate category
      if (category.type !== ChannelType.GuildCategory) {
        const embed = addLogo(
          new EmbedBuilder()
            .setDescription(`❌ ${category} is not a category! Please select an actual category channel.`)
            .setColor(0xED4245),
          config
        );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Setup channels
      config.ticket_category_id = category.id;
      config.ticket_log_channel_id = logChannel.id;

      // Initialize panel if needed
      if (!config.ticket_panel) {
        const { DEFAULT_PANEL } = require("../features/tickets_v2");
        config.ticket_panel = JSON.parse(JSON.stringify(DEFAULT_PANEL));
      }

      // Apply customizations
      if (title) config.ticket_panel.title = title;
      if (color) config.ticket_panel.color = parseInt(color.replace("#", ""), 16);

      saveJson(configPath, config);

      const embed = addLogo(
        new EmbedBuilder()
          .setTitle("Ticket System Configured")
          .setDescription(
            `Ticket system is ready.\n\u200b`
          )
          .addFields(
            { name: "Ticket Category", value: `${category}`, inline: true },
            { name: "Log Channel", value: `${logChannel}`, inline: true },
            { name: "Default Buttons", value: "4", inline: true },
            { name: "Features", value: "• Username-based channels\n• Transcripts\n• Auto DM\n• Claim system\n• Logging", inline: false },
            { name: "Next Step", value: "Use `/ticketpanel` to post the panel.\nCustomize with `/ticketsetup panel` or `/ticketsetup addbutton`", inline: false }
          )
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "staff") {
      const role1 = interaction.options.getRole("role1", true);
      const role2 = interaction.options.getRole("role2");
      const role3 = interaction.options.getRole("role3");

      if (!config.staff_role_ids) config.staff_role_ids = [];

      config.staff_role_ids = [role1.id];
      if (role2) config.staff_role_ids.push(role2.id);
      if (role3) config.staff_role_ids.push(role3.id);

      saveJson(configPath, config);

      let roleList = `• ${role1}\n`;
      if (role2) roleList += `• ${role2}\n`;
      if (role3) roleList += `• ${role3}\n`;

      const embed = addLogo(
        new EmbedBuilder()
          .setTitle("Staff Tracking Enabled")
          .setDescription(
            `Staff tracking is now active.\n\u200b`
          )
          .addFields(
            { name: "Tracked Roles", value: roleList, inline: false },
            { name: "Features", value: "• Message tracking\n• Daily/Weekly/Monthly stats\n• Streak tracking\n• Achievements\n• Milestones", inline: false },
            { name: "View Stats", value: "`/staffreport` - team overview\n`/staffstats` - individual stats", inline: false }
          )
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }
  }

  // ============== OWNER/COOWNER COMMANDS ==============
  if (!isOwnerOrCoowner(member, config)) {
    const embed = addLogo(
      new EmbedBuilder()
        .setDescription("❌ You don't have permission to use this command!")
        .setColor(0xED4245),
      config
    );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (name === "verifyembed") {
    const verifyUrl = buildDiscordAuthUrl();
    const logoPath = path.join(__dirname, "..", "logo", "Lurked.png");
    const logoAttachment = new AttachmentBuilder(logoPath, { name: "Lurked.png" });
    const embed = new EmbedBuilder()
      .setTitle("Discord Verification")
      .setDescription(
        "Click the button below to verify your Discord account.\n" +
          "This restores access and applies the verified role automatically."
      )
      .setColor(0x5865F2)
      .setThumbnail("attachment://Lurked.png")
      .setFooter({ text: "Complete verification on the website to finish" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Verify with Discord")
        .setStyle(ButtonStyle.Link)
        .setURL(verifyUrl)
    );

    return interaction.reply({ embeds: [embed], components: [row], files: [logoAttachment] });
  }

  // Role Management
  if (name === "addstaffrole") {
    const role = interaction.options.getRole("role", true);
    const set = new Set(config.staff_role_ids || []);
    set.add(role.id);
    config.staff_role_ids = Array.from(set);
    saveJson(configPath, config);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`✅ Added staff role: ${role}`)
        .setColor(0x57F287),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  if (name === "removestaffrole") {
    const role = interaction.options.getRole("role", true);
    const set = new Set(config.staff_role_ids || []);
    if (set.delete(role.id)) {
      config.staff_role_ids = Array.from(set);
      saveJson(configPath, config);
      const embed = addLogo(
        new EmbedBuilder()
          .setDescription(`✅ Removed staff role: ${role}`)
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    } else {
      const embed = addLogo(
        new EmbedBuilder()
          .setDescription("❌ That role is not in the staff list!")
          .setColor(0xED4245),
        config
      );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }

  if (name === "setboosterrole") {
    const role = interaction.options.getRole("role", true);
    config.booster_role_id = role.id;
    saveJson(configPath, config);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`✅ Booster role set to: ${role}`)
        .setColor(0x57F287),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  if (name === "addownerrole") {
    const role = interaction.options.getRole("role", true);
    const set = new Set(config.owner_role_ids || []);
    set.add(role.id);
    config.owner_role_ids = Array.from(set);
    saveJson(configPath, config);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`✅ Added owner role: ${role}`)
        .setColor(0x57F287),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  if (name === "addcoownerrole") {
    const role = interaction.options.getRole("role", true);
    const set = new Set(config.coowner_role_ids || []);
    set.add(role.id);
    config.coowner_role_ids = Array.from(set);
    saveJson(configPath, config);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`✅ Added co-owner role: ${role}`)
        .setColor(0x57F287),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  // Staff Reports
  if (name === "staffreport") {
    return showStaffReport(interaction, data, config);
  }

  if (name === "staffstats") {
    return showStaffStats(interaction, data, config);
  }

  // Boost Management
  if (name === "boostreport") {
    return showBoostReport(interaction, data);
  }

  if (name === "boostlog") {
    return showBoostLog(interaction, data);
  }

  if (name === "boosts") {
    return showCurrentBoosters(interaction, config, data);
  }

  // Ticket Setup - All-in-one configuration command
  if (name === "ticketsetup") {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "channels") {
      const category = interaction.options.getChannel("category", true);
      const logChannel = interaction.options.getChannel("logchannel", true);

      // Validate that category is actually a category
      const { ChannelType } = require("discord.js");
      if (category.type !== ChannelType.GuildCategory) {
        const embed = addLogo(
          new EmbedBuilder()
            .setDescription(`❌ ${category} is not a category! Please select an actual category channel (not a text/voice channel).`)
            .setColor(0xED4245),
          config
        );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      config.ticket_category_id = category.id;
      config.ticket_log_channel_id = logChannel.id;
      saveJson(configPath, config);

      const embed = addLogo(
        new EmbedBuilder()
          .setTitle("Ticket Channels Configured")
          .addFields(
            { name: "Category", value: `${category}`, inline: true },
            { name: "Log Channel", value: `${logChannel}`, inline: true }
          )
          .setDescription("Use `/ticketsetup panel` to customize appearance.")
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "panel") {
      const panel = getPanelConfig(config);
      let updated = [];

      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description");
      const color = interaction.options.getString("color");
      const footer = interaction.options.getString("footer");
      const thumbnail = interaction.options.getString("thumbnail");

      if (title) {
        panel.title = title;
        updated.push("title");
      }
      if (description) {
        panel.description = description;
        updated.push("description");
      }
      if (color) {
        panel.color = parseInt(color.replace("#", ""), 16);
        updated.push("color");
      }
      if (footer) {
        panel.footer = footer;
        updated.push("footer");
      }
      if (thumbnail) {
        panel.thumbnail = thumbnail;
        updated.push("thumbnail");
      }

      if (updated.length === 0) {
        const embed = addLogo(
          new EmbedBuilder()
            .setDescription("❌ Please provide at least one option to update!")
            .setColor(0xED4245),
          config
        );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      config.ticket_panel = panel;
      saveJson(configPath, config);

      const embed = addLogo(
        new EmbedBuilder()
          .setDescription(`✅ Panel updated: ${updated.join(", ")}!`)
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "addbutton") {
      const panel = getPanelConfig(config);
      const id = interaction.options.getString("id");
      const label = interaction.options.getString("label");
      const emoji = interaction.options.getString("emoji");
      const style = interaction.options.getString("style");
      const description = interaction.options.getString("description") || "";

      const buttonIndex = panel.buttons.findIndex(b => b.id === id);
      const buttonData = { id, label, emoji, style, description };

      if (buttonIndex >= 0) {
        panel.buttons[buttonIndex] = buttonData;
      } else {
        panel.buttons.push(buttonData);
      }

      config.ticket_panel = panel;
      saveJson(configPath, config);

      const embed = addLogo(
        new EmbedBuilder()
          .setTitle(`Button ${buttonIndex >= 0 ? 'Updated' : 'Added'}`)
          .setDescription(
            `ID: \`${id}\`\n` +
            `Label: ${label}\n` +
            `Emoji: ${emoji}\n` +
            `Style: ${style}\n` +
            `Description: ${description || "None"}\n\n` +
            `Total buttons: ${panel.buttons.length}`
          )
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "removebutton") {
      const panel = getPanelConfig(config);
      const id = interaction.options.getString("id");

      const buttonIndex = panel.buttons.findIndex(b => b.id === id);

      if (buttonIndex === -1) {
        const embed = addLogo(
          new EmbedBuilder()
            .setDescription(`❌ Button with ID \`${id}\` not found!`)
            .setColor(0xED4245),
          config
        );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const removedButton = panel.buttons[buttonIndex];
      panel.buttons.splice(buttonIndex, 1);

      config.ticket_panel = panel;
      saveJson(configPath, config);

      const embed = addLogo(
        new EmbedBuilder()
          .setDescription(`✅ Removed button "${removedButton.label}" (ID: \`${id}\`)`)
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "listbuttons") {
      const panel = getPanelConfig(config);

      if (panel.buttons.length === 0) {
        const embed = addLogo(
          new EmbedBuilder()
            .setDescription("❌ No buttons configured! Use `/ticketsetup addbutton` to add one.")
            .setColor(0xED4245),
          config
        );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const buttonList = panel.buttons.map((btn, i) =>
        `${i + 1}. ${btn.emoji} ${btn.label}\n` +
        `   ID: \`${btn.id}\` | Style: ${btn.style}` +
        (btn.description ? `\n   ${btn.description}` : "")
      ).join("\n\n");

      const embed = addLogo(
        new EmbedBuilder()
          .setTitle("Ticket Buttons")
          .setDescription(buttonList)
          .setFooter({ text: `Total: ${panel.buttons.length}` })
          .setColor(0x5865F2),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "reorderbuttons") {
      const panel = getPanelConfig(config);
      const orderString = interaction.options.getString("order", true);
      const newOrder = orderString.split(",").map(id => id.trim());

      // Validate all IDs exist
      const existingIds = panel.buttons.map(b => b.id);
      const invalidIds = newOrder.filter(id => !existingIds.includes(id));
      const missingIds = existingIds.filter(id => !newOrder.includes(id));

      if (invalidIds.length > 0) {
        const embed = addLogo(
          new EmbedBuilder()
            .setDescription(`❌ Unknown button IDs: ${invalidIds.join(", ")}`)
            .setColor(0xED4245),
          config
        );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (missingIds.length > 0) {
        const embed = addLogo(
          new EmbedBuilder()
            .setDescription(`❌ Missing button IDs in order: ${missingIds.join(", ")}`)
            .setColor(0xED4245),
          config
        );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Reorder buttons
      const reorderedButtons = newOrder.map(id => panel.buttons.find(b => b.id === id));
      panel.buttons = reorderedButtons;
      config.ticket_panel = panel;
      saveJson(configPath, config);

      const buttonList = panel.buttons.map((btn, i) => `${i + 1}. ${btn.emoji} ${btn.label} (${btn.id})`).join("\n");

      const embed = addLogo(
        new EmbedBuilder()
          .setTitle("Buttons Reordered")
          .setDescription(`New order:\n${buttonList}`)
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "reset") {
      config.ticket_panel = JSON.parse(JSON.stringify(DEFAULT_PANEL));
      saveJson(configPath, config);
      const embed = addLogo(
        new EmbedBuilder()
          .setDescription("✅ Ticket panel reset to default settings!")
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }
  }

  if (name === "ticketpanel") {
    return createTicketPanel(interaction, config, configPath);
  }

  // Roles Panel
  if (name === "rolespanel") {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "configure") {
      const roleType = interaction.options.getString("id", true);
      const role = interaction.options.getRole("role", true);

      const panel = getRolesPanelConfig(config);
      const roleConfig = panel.roles.find(r => r.id === roleType);

      if (roleConfig) {
        roleConfig.role_id = role.id;
        config.roles_panel = panel;
        saveJson(configPath, config);

        const embed = addLogo(
          new EmbedBuilder()
            .setDescription(`✅ Configured ${roleConfig.label} → ${role}`)
            .setColor(0x57F287),
          config
        );
        return interaction.reply({ embeds: [embed] });
      }
    }

    if (subcommand === "customize") {
      const panel = getRolesPanelConfig(config);
      let updated = [];

      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description");
      const color = interaction.options.getString("color");

      if (title) {
        panel.title = title;
        updated.push("title");
      }
      if (description) {
        panel.description = description;
        updated.push("description");
      }
      if (color) {
        panel.color = parseInt(color.replace("#", ""), 16);
        updated.push("color");
      }

      if (updated.length === 0) {
        const embed = addLogo(
          new EmbedBuilder()
            .setDescription("❌ Please provide at least one option to update!")
            .setColor(0xED4245),
          config
        );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      config.roles_panel = panel;
      saveJson(configPath, config);

      const embed = addLogo(
        new EmbedBuilder()
          .setDescription(`✅ Panel updated: ${updated.join(", ")}!`)
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "post") {
      return createRolesPanel(interaction, config, configPath);
    }
  }

  // Movie Night
  if (name === "movie") {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "announce") {
      return announceMovie(interaction, config, data, dataPath);
    }
    if (subcommand === "schedule") {
      return addToSchedule(interaction, data, dataPath);
    }
    if (subcommand === "upcoming") {
      return showSchedule(interaction, data);
    }
    if (subcommand === "remove") {
      return removeFromSchedule(interaction, data, dataPath);
    }
    if (subcommand === "poll") {
      return createMoviePoll(interaction, data, dataPath);
    }
    if (subcommand === "volume") {
      return showVolumeHelp(interaction);
    }
    if (subcommand === "stats") {
      return showStats(interaction, data);
    }
  }

  // Giveaway System
  if (name === "giveaway") {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "start") {
      return startGiveaway(interaction, data, dataPath);
    }
    if (subcommand === "end") {
      return endGiveaway(interaction, data, dataPath);
    }
    if (subcommand === "reroll") {
      return rerollGiveaway(interaction, data, dataPath);
    }
    if (subcommand === "list") {
      return listGiveaways(interaction, data);
    }
  }

  // Help Command
  if (name === "help") {
    const embed = new EmbedBuilder()
      .setTitle("Bot Commands & Features")
      .setDescription("Here's everything I can do for your server.")
      .setColor(0x5865F2)
      .addFields(
        {
          name: "🎬 Movie Night",
          value:
            "`/movie announce` - Announce a movie with RSVP buttons\n" +
            "`/movie schedule` - Add a movie to the schedule\n" +
            "`/movie upcoming` - View scheduled movies\n" +
            "`/movie poll` - Create a movie vote poll\n" +
            "`/movie volume` - Audio troubleshooting guide\n" +
            "`/movie stats` - View movie night statistics",
          inline: false
        },
        {
          name: "🎫 Support Tickets",
          value:
            "`/ticketpanel` - Post the ticket panel\n" +
            "`/ticketsetup` - Configure ticket system\n" +
            "`/ticketpriority` - Set ticket priority (🟢🟡🟠🔴)\n" +
            "`/ticketnote` - Add staff notes\n" +
            "`/ticketadd` - Add user to ticket\n" +
            "`/ticketremove` - Remove user from ticket\n" +
            "`/ticketparticipants` - View ticket participants\n" +
            "`/ticketrename` - Rename ticket channel\n" +
            "`/setratingschannel` - Set ratings channel\n" +
            "`/ticketstats` - View ticket statistics\n" +
            "**Features:** HTML transcripts, dual ratings (ticket + staff), auto-close",
          inline: false
        },
        {
          name: "🎭 Roles Panel",
          value:
            "`/rolespanel configure` - Set up self-assignable roles\n" +
            "`/rolespanel post` - Post the roles panel\n" +
            "`/rolespanel customize` - Customize panel appearance",
          inline: false
        },
        {
          name: "👥 Staff Tracking",
          value:
            "`/staffreport` - Team activity overview\n" +
            "`/staffstats` - Individual staff stats & ratings\n" +
            "`/quicksetup staff` - Quick staff setup\n" +
            "**Features:** Ticket ratings, performance scores",
          inline: true
        },
        {
          name: "💎 Boost Tracking",
          value:
            "`/boostreport` - Server boost analytics\n" +
            "`/boostlog` - Boost history log\n" +
            "`/currentboosters` - Active boosters",
          inline: true
        },
        {
          name: "🛡️ Moderation",
          value:
            "`/purge` - Delete messages in bulk\n" +
            "`/timeout` - Timeout users (mute)\n" +
            "`/untimeout` - Remove timeout\n" +
            "`/kick` - Kick users from server\n" +
            "`/ban` - Permanent ban + delete messages\n" +
            "`/softban` - Kick + clean messages\n" +
            "`/unban` - Unban users\n" +
            "`/strikes` - Check user violations",
          inline: true
        },
        {
          name: "🤖 Auto-Moderation",
          value:
            "`/automod enable/disable` - Toggle system\n" +
            "`/automod status` - View configuration\n" +
            "**Filters:** Spam protection (5 msgs/10s)\n" +
            "**Strike System:** Progressive punishments\n" +
            "**Note:** Ticket channels are exempt from filters",
          inline: true
        },
        {
          name: "🎁 Giveaways",
          value:
            "`/giveaway start` - Create giveaways\n" +
            "`/giveaway end` - End early\n" +
            "`/giveaway reroll` - Reroll winners",
          inline: true
        },
        {
          name: "📊 Polls",
          value:
            "`/poll` - Create reaction polls\n" +
            "**Options:** 2-5 choices, custom duration",
          inline: true
        },
        {
          name: "💬 Welcome/Leave",
          value:
            "`/setwelcome` - Set welcome messages\n" +
            "`/setleave` - Set leave messages\n" +
            "`/disablewelcome` `/disableleave`",
          inline: true
        },
        {
          name: "⚙️ Quick Setup",
          value:
            "`/quicksetup tickets` - Setup tickets in one command\n" +
            "`/quicksetup staff` - Setup staff tracking in one command",
          inline: false
        },
        {
          name: "📝 Additional Commands",
          value:
            "`/setlogo` - Set server logo for embeds\n" +
            "`/setlogchannel` - Set audit log channel",
          inline: false
        }
      )
      .setFooter({ text: "Use /quicksetup for fast configuration | Admin commands require permissions" })
      .setTimestamp();

    if (config.logo_url) embed.setThumbnail(config.logo_url);

    return interaction.reply({ embeds: [embed] });
  }

  // Moderation
  if (name === "nuke") {
    return nukeMessages(interaction);
  }

  if (name === "timeout") {
    return timeoutUser(interaction);
  }

  if (name === "untimeout") {
    return untimeoutUser(interaction);
  }

  if (name === "kick") {
    return kickUser(interaction);
  }

  if (name === "ban") {
    return banUser(interaction);
  }

  if (name === "softban") {
    return softbanUser(interaction);
  }

  if (name === "unban") {
    return unbanUser(interaction);
  }

  // Poll System
  if (name === "poll") {
    return createPoll(interaction, data, dataPath);
  }

  // Welcome/Leave Messages
  if (name === "setwelcome") {
    const channel = interaction.options.getChannel("channel", true);
    const message = interaction.options.getString("message");
    config.welcome_channel_id = channel.id;
    if (message) config.welcome_message = message;
    saveJson(configPath, config);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`✅ Welcome messages enabled in ${channel}`)
        .setColor(0x57F287),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  if (name === "setleave") {
    const channel = interaction.options.getChannel("channel", true);
    const message = interaction.options.getString("message");
    config.leave_channel_id = channel.id;
    if (message) config.leave_message = message;
    saveJson(configPath, config);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`✅ Leave messages enabled in ${channel}`)
        .setColor(0x57F287),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  if (name === "disablewelcome") {
    delete config.welcome_channel_id;
    delete config.welcome_message;
    saveJson(configPath, config);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription("✅ Welcome messages disabled")
        .setColor(0x57F287),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  if (name === "disableleave") {
    delete config.leave_channel_id;
    delete config.leave_message;
    saveJson(configPath, config);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription("✅ Leave messages disabled")
        .setColor(0x57F287),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  // Audit Logging
  if (name === "setlogchannel") {
    const channel = interaction.options.getChannel("channel", true);
    config.audit_log_channel_id = channel.id;
    saveJson(configPath, config);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`✅ Audit logs will be sent to ${channel}`)
        .setColor(0x57F287),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  if (name === "verifylog") {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "set") {
      const channel = interaction.options.getChannel("channel", true);
      config.verify_log_channel_id = channel.id;
      saveJson(configPath, config);

      const embed = addLogo(
        new EmbedBuilder()
          .setDescription(`Verification logs will be sent to ${channel}`)
          .setColor(0x57F287),
        config
      );
      return interaction.reply({ embeds: [embed] });
    }
  }

  if (name === "disablelogs") {
    delete config.audit_log_channel_id;
    saveJson(configPath, config);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription("✅ Audit logging disabled")
        .setColor(0x57F287),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  // Auto-Moderation
  if (name === "automod") {
    return configureAutomod(interaction, config, configPath);
  }

  if (name === "strikes") {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const userData = getUserStrikes(targetUser.id, data);

    const embed = new EmbedBuilder()
      .setTitle(`Strike Report - ${targetUser.tag}`)
      .addFields(
        { name: "Current Strikes", value: `${userData.strikes}/3`, inline: true },
        { name: "User", value: `${targetUser}`, inline: true },
        { name: "\u200b", value: "\u200b", inline: true }
      )
      .setColor(userData.strikes === 0 ? 0x57F287 : userData.strikes === 1 ? 0xFEE75C : userData.strikes === 2 ? 0xF26522 : 0xED4245)
      .setThumbnail(targetUser.displayAvatarURL())
      .setFooter({ text: "Strikes reset after 30 days of inactivity" })
      .setTimestamp();

    if (userData.violations.length > 0) {
      const violationList = userData.violations
        .slice(-5) // Show last 5 violations
        .reverse()
        .map((v, i) => {
          const timestamp = Math.floor(new Date(v.timestamp).getTime() / 1000);
          return `${i + 1}. <t:${timestamp}:R> - ${v.reason}`;
        })
        .join("\n");

      embed.addFields({
        name: "Recent Violations (Last 5)",
        value: violationList,
        inline: false
      });
    } else {
      embed.addFields({
        name: "✅ Clean Record",
        value: "No violations found",
        inline: false
      });
    }

    embed.addFields({
      name: "Progressive Punishment System",
      value:
        `• Strike 1: Warning + 5 minute timeout\n` +
        `• Strike 2: 24 hour timeout\n` +
        `• Strike 3: Permanent ban`,
      inline: false
    });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Ticket Enhancements
  if (name === "ticketpriority") {
    return setTicketPriority(interaction, data, dataPath);
  }

  if (name === "ticketnote") {
    return addTicketNote(interaction, data, dataPath);
  }

  if (name === "ticketnotes") {
    return viewTicketNotes(interaction, data);
  }

  if (name === "ticketstats") {
    return viewTicketStats(interaction, data, config);
  }

  if (name === "ticketautoclose") {
    return toggleAutoClose(interaction, config, configPath);
  }

  if (name === "ticketrename") {
    return renameTicket(interaction, data, dataPath);
  }

  if (name === "setratingschannel") {
    return setRatingsChannel(interaction, config, configPath);
  }

  if (name === "ticketadd") {
    return addUserToTicket(interaction, data, dataPath, config);
  }

  if (name === "ticketremove") {
    return removeUserFromTicket(interaction, data, dataPath, config);
  }

  if (name === "ticketparticipants") {
    return listTicketParticipants(interaction, data, dataPath);
  }

  // Remove strikes command
  if (name === "removestrikes") {
    const targetUser = interaction.options.getUser("user", true);
    const removed = removeUserStrikes(targetUser.id, data, dataPath);

    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(
          removed
            ? `✅ Removed all strikes from ${targetUser} (${targetUser.tag})`
            : `⚠️ ${targetUser} (${targetUser.tag}) has no strikes to remove`
        )
        .setColor(removed ? 0x57F287 : 0xFEE75C),
      config
    );

    return interaction.reply({ embeds: [embed] });
  }

  // Clear all strikes command
  if (name === "clearallstrikes") {
    const count = removeAllStrikes(data, dataPath);

    const embed = addLogo(
      new EmbedBuilder()
        .setTitle("Mass Strike Removal")
        .setDescription(
          count > 0
            ? `✅ Successfully cleared strikes from **${count}** user${count !== 1 ? 's' : ''}`
            : `⚠️ No strikes found in the database`
        )
        .setColor(count > 0 ? 0x57F287 : 0xFEE75C)
        .setFooter({ text: "All automod violations have been reset" })
        .setTimestamp(),
      config
    );

    return interaction.reply({ embeds: [embed] });
  }

  // Userinfo command
  if (name === "userinfo") {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      const embed = addLogo(
        new EmbedBuilder()
          .setDescription("❌ User not found in this server!")
          .setColor(0xED4245),
        config
      );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Get user's roles (excluding @everyone)
    const roles = targetMember.roles.cache
      .filter(role => role.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(role => role.toString())
      .slice(0, 20); // Limit to 20 roles to avoid embed limits

    // Calculate account age
    const accountCreated = Math.floor(targetUser.createdTimestamp / 1000);
    const joinedServer = Math.floor(targetMember.joinedTimestamp / 1000);
    const accountAgeDays = Math.floor((Date.now() - targetUser.createdTimestamp) / (1000 * 60 * 60 * 24));
    const serverAgeDays = Math.floor((Date.now() - targetMember.joinedTimestamp) / (1000 * 60 * 60 * 24));

    // Get user's permissions
    const keyPermissions = [];
    if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) keyPermissions.push("Administrator");
    if (targetMember.permissions.has(PermissionFlagsBits.ManageGuild)) keyPermissions.push("Manage Server");
    if (targetMember.permissions.has(PermissionFlagsBits.ManageChannels)) keyPermissions.push("Manage Channels");
    if (targetMember.permissions.has(PermissionFlagsBits.ManageRoles)) keyPermissions.push("Manage Roles");
    if (targetMember.permissions.has(PermissionFlagsBits.BanMembers)) keyPermissions.push("Ban Members");
    if (targetMember.permissions.has(PermissionFlagsBits.KickMembers)) keyPermissions.push("Kick Members");

    // Get boost status
    const boostStatus = targetMember.premiumSince
      ? `✨ Boosting since <t:${Math.floor(targetMember.premiumSinceTimestamp / 1000)}:R>`
      : "Not boosting";

    // Get user status/activity
    const presence = targetMember.presence;
    const statusEmojis = {
      online: "🟢",
      idle: "🟡",
      dnd: "🔴",
      offline: "⚫"
    };
    const statusText = presence ? `${statusEmojis[presence.status] || "⚫"} ${presence.status.charAt(0).toUpperCase() + presence.status.slice(1)}` : "⚫ Offline";

    const embed = new EmbedBuilder()
      .setTitle(`User Information - ${targetUser.tag}`)
      .setColor(targetMember.displayHexColor || 0x5865F2)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: "Username", value: targetUser.username, inline: true },
        { name: "Display Name", value: targetMember.displayName, inline: true },
        { name: "User ID", value: `\`${targetUser.id}\``, inline: true },
        { name: "Account Created", value: `<t:${accountCreated}:F>\n<t:${accountCreated}:R> (${accountAgeDays} days ago)`, inline: false },
        { name: "Joined Server", value: `<t:${joinedServer}:F>\n<t:${joinedServer}:R> (${serverAgeDays} days ago)`, inline: false },
        { name: "Boost Status", value: boostStatus, inline: false },
        { name: "Status", value: statusText, inline: true },
        { name: `Roles [${roles.length}]`, value: roles.length > 0 ? roles.join(", ") : "No roles", inline: false }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    // Add permissions if user has any key permissions
    if (keyPermissions.length > 0) {
      embed.addFields({
        name: "Key Permissions",
        value: keyPermissions.join(", "),
        inline: false
      });
    }

    // Add avatar link
    embed.addFields({
      name: "Avatar",
      value: `[View Full Size](${targetUser.displayAvatarURL({ dynamic: true, size: 4096 })})`,
      inline: false
    });

    return interaction.reply({ embeds: [embed] });
  }

}

module.exports = { handleInteraction };
