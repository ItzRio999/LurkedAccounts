const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

const commands = [
  // ============== QUICK SETUP ==============
  new SlashCommandBuilder()
    .setName("quicksetup")
    .setDescription("⚡ Quick setup for bot features - one command does it all!")
    .addSubcommand(sub =>
      sub
        .setName("tickets")
        .setDescription("Setup the entire ticket system in one command")
        .addChannelOption((opt) =>
          opt
            .setName("category")
            .setDescription("Category where tickets will be created")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName("logchannel")
            .setDescription("Channel for ticket logs and transcripts")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(opt => opt.setName("title").setDescription("Panel title (optional)"))
        .addStringOption(opt => opt.setName("color").setDescription("Panel color in hex (e.g., #5865F2) (optional)"))
    )
    .addSubcommand(sub =>
      sub
        .setName("staff")
        .setDescription("Setup staff tracking in one command")
        .addRoleOption((opt) => opt.setName("role1").setDescription("Staff role to track").setRequired(true))
        .addRoleOption((opt) => opt.setName("role2").setDescription("Additional staff role to track"))
        .addRoleOption((opt) => opt.setName("role3").setDescription("Additional staff role to track"))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ============== STAFF & ROLE MANAGEMENT ==============
  new SlashCommandBuilder()
    .setName("addstaffrole")
    .setDescription("Add a staff role to track")
    .addRoleOption((opt) => opt.setName("role").setDescription("Role to track").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("removestaffrole")
    .setDescription("Remove a staff role from tracking")
    .addRoleOption((opt) => opt.setName("role").setDescription("Role to remove").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setboosterrole")
    .setDescription("Set the booster role for auto management")
    .addRoleOption((opt) => opt.setName("role").setDescription("Booster role").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("addownerrole")
    .setDescription("Add an owner role")
    .addRoleOption((opt) => opt.setName("role").setDescription("Owner role").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("addcoownerrole")
    .setDescription("Add a co-owner role")
    .addRoleOption((opt) => opt.setName("role").setDescription("Co-owner role").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ============== STAFF REPORTS ==============
  new SlashCommandBuilder()
    .setName("staffreport")
    .setDescription("Show staff activity counts")
    .addIntegerOption((opt) =>
      opt
        .setName("days")
        .setDescription("Lookback window in days (default: 7)")
        .setMinValue(1)
        .setMaxValue(365)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("staffstats")
    .setDescription("Show a single staff member's activity")
    .addUserOption((opt) => opt.setName("member").setDescription("Staff member").setRequired(true))
    .addIntegerOption((opt) =>
      opt
        .setName("days")
        .setDescription("Lookback window in days (default: 7)")
        .setMinValue(1)
        .setMaxValue(365)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ============== BOOST MANAGEMENT ==============
  new SlashCommandBuilder()
    .setName("boostreport")
    .setDescription("Show boost gains/losses")
    .addIntegerOption((opt) =>
      opt
        .setName("days")
        .setDescription("Lookback window in days (default: 30)")
        .setMinValue(1)
        .setMaxValue(365)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("boostlog")
    .setDescription("Show recent boost events")
    .addIntegerOption((opt) =>
      opt.setName("limit").setDescription("Number of events (default: 5)").setMinValue(1).setMaxValue(25)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("boosts")
    .setDescription("Show current booster count and status")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ============== TICKET SYSTEM ==============
  new SlashCommandBuilder()
    .setName("ticketsetup")
    .setDescription("Configure ticket system - all settings in one command!")
    .addSubcommand(sub =>
      sub
        .setName("channels")
        .setDescription("Set ticket category and log channel")
        .addChannelOption((opt) =>
          opt
            .setName("category")
            .setDescription("Category for tickets (must be a category, not a text channel)")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName("logchannel")
            .setDescription("Channel for ticket logs")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("panel")
        .setDescription("Customize the ticket panel embed")
        .addStringOption(opt => opt.setName("title").setDescription("Panel title").setRequired(false))
        .addStringOption(opt => opt.setName("description").setDescription("Panel description").setRequired(false))
        .addStringOption(opt => opt.setName("color").setDescription("Hex color (e.g., #5865F2)").setRequired(false))
        .addStringOption(opt => opt.setName("footer").setDescription("Footer text").setRequired(false))
        .addStringOption(opt => opt.setName("thumbnail").setDescription("Thumbnail image URL").setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName("addbutton")
        .setDescription("Add a ticket category button")
        .addStringOption(opt => opt.setName("id").setDescription("Button ID (e.g., general, bug, billing)").setRequired(true))
        .addStringOption(opt => opt.setName("label").setDescription("Button text shown to users").setRequired(true))
        .addStringOption(opt => opt.setName("emoji").setDescription("Button emoji (e.g., 🔧, 🐛, 💰)").setRequired(true))
        .addStringOption(opt =>
          opt
            .setName("style")
            .setDescription("Button color")
            .setRequired(true)
            .addChoices(
              { name: "Blue (Primary)", value: "Primary" },
              { name: "Gray (Secondary)", value: "Secondary" },
              { name: "Green (Success)", value: "Success" },
              { name: "Red (Danger)", value: "Danger" }
            )
        )
        .addStringOption(opt => opt.setName("description").setDescription("What this button is for (optional)"))
    )
    .addSubcommand(sub =>
      sub
        .setName("removebutton")
        .setDescription("Remove a ticket button by ID")
        .addStringOption(opt => opt.setName("id").setDescription("Button ID to remove").setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName("listbuttons")
        .setDescription("Show all configured ticket buttons")
    )
    .addSubcommand(sub =>
      sub
        .setName("reorderbuttons")
        .setDescription("Reorder ticket buttons by their IDs")
        .addStringOption(opt => opt.setName("order").setDescription("Button IDs in order (comma-separated, e.g., general,bug,account,other)").setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName("reset")
        .setDescription("Reset ticket panel to default settings")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Post the ticket panel in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ============== ROLES PANEL ==============
  new SlashCommandBuilder()
    .setName("rolespanel")
    .setDescription("Configure and manage the self-roles panel")
    .addSubcommand(sub =>
      sub
        .setName("configure")
        .setDescription("Configure a role for the panel")
        .addStringOption(opt =>
          opt
            .setName("id")
            .setDescription("Role ID (announcements, drops, or movies)")
            .setRequired(true)
            .addChoices(
              { name: "Announcements", value: "announcements" },
              { name: "Account Drops", value: "drops" },
              { name: "Movie Nights", value: "movies" }
            )
        )
        .addRoleOption(opt => opt.setName("role").setDescription("The role to assign").setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName("customize")
        .setDescription("Customize the panel appearance")
        .addStringOption(opt => opt.setName("title").setDescription("Panel title"))
        .addStringOption(opt => opt.setName("description").setDescription("Panel description"))
        .addStringOption(opt => opt.setName("color").setDescription("Hex color (e.g., #5865F2)"))
    )
    .addSubcommand(sub =>
      sub
        .setName("post")
        .setDescription("Post the roles panel in this channel")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ============== MOVIE NIGHT ==============
  new SlashCommandBuilder()
    .setName("movie")
    .setDescription("Movie night commands")
    .addSubcommand(sub =>
      sub
        .setName("announce")
        .setDescription("Announce a movie")
        .addStringOption(opt => opt.setName("title").setDescription("Movie title").setRequired(true))
        .addStringOption(opt => opt.setName("time").setDescription("Start time (e.g., 8:00 PM, in 30 minutes)"))
        .addChannelOption(opt => opt.setName("voice").setDescription("Voice channel"))
        .addStringOption(opt => opt.setName("genre").setDescription("Movie genre"))
        .addStringOption(opt => opt.setName("runtime").setDescription("Runtime (e.g., 2h 15m)"))
        .addStringOption(opt => opt.setName("poster").setDescription("Movie poster image URL"))
    )
    .addSubcommand(sub =>
      sub
        .setName("schedule")
        .setDescription("Add a movie to the schedule")
        .addStringOption(opt => opt.setName("title").setDescription("Movie title").setRequired(true))
        .addStringOption(opt => opt.setName("date").setDescription("Date and time (e.g., Dec 31 8:00 PM, 2025-12-31 20:00)").setRequired(true))
        .addStringOption(opt => opt.setName("genre").setDescription("Movie genre"))
    )
    .addSubcommand(sub =>
      sub
        .setName("upcoming")
        .setDescription("Show scheduled movies")
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove a scheduled movie")
        .addIntegerOption(opt => opt.setName("number").setDescription("Movie number from schedule (use /movie upcoming to see)").setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub
        .setName("poll")
        .setDescription("Create a movie vote poll")
        .addStringOption(opt => opt.setName("movie1").setDescription("First movie option").setRequired(true))
        .addStringOption(opt => opt.setName("movie2").setDescription("Second movie option").setRequired(true))
        .addStringOption(opt => opt.setName("movie3").setDescription("Third movie option"))
        .addStringOption(opt => opt.setName("movie4").setDescription("Fourth movie option"))
        .addStringOption(opt => opt.setName("question").setDescription("Poll question (default: Which movie should we watch?)"))
    )
    .addSubcommand(sub =>
      sub
        .setName("volume")
        .setDescription("Show volume booster and audio help")
    )
    .addSubcommand(sub =>
      sub
        .setName("stats")
        .setDescription("Show movie night statistics")
    ),

  // ============== MODERATION ==============
  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("🔥 Nuke messages in bulk")
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("Number of messages to nuke (1-1000)").setRequired(true).setMinValue(1).setMaxValue(1000)
    )
    .addUserOption((opt) => opt.setName("user").setDescription("Only nuke messages from this user"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user (prevent them from sending messages)")
    .addUserOption(opt => opt.setName("user").setDescription("User to timeout").setRequired(true))
    .addIntegerOption(opt =>
      opt
        .setName("duration")
        .setDescription("Duration in minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320) // 28 days max
    )
    .addStringOption(opt => opt.setName("reason").setDescription("Reason for timeout"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout from a user")
    .addUserOption(opt => opt.setName("user").setDescription("User to remove timeout from").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Reason for removing timeout"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from the server")
    .addUserOption(opt => opt.setName("user").setDescription("User to kick").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Reason for kick"))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Permanently ban a user (hard ban)")
    .addUserOption(opt => opt.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Reason for ban"))
    .addIntegerOption(opt =>
      opt
        .setName("delete_days")
        .setDescription("Delete messages from last X days (1-7)")
        .setMinValue(1)
        .setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName("softban")
    .setDescription("Kick user and delete their messages (can rejoin)")
    .addUserOption(opt => opt.setName("user").setDescription("User to soft ban").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Reason for soft ban"))
    .addIntegerOption(opt =>
      opt
        .setName("delete_days")
        .setDescription("Delete messages from last X days (1-7)")
        .setMinValue(1)
        .setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .addStringOption(opt => opt.setName("user_id").setDescription("User ID to unban").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Reason for unban"))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  // ============== AUTO-MODERATION ==============
  new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure auto-moderation system")
    .addSubcommand(sub =>
      sub
        .setName("enable")
        .setDescription("Enable auto-moderation")
    )
    .addSubcommand(sub =>
      sub
        .setName("disable")
        .setDescription("Disable auto-moderation")
    )
    .addSubcommand(sub =>
      sub
        .setName("spam")
        .setDescription("Configure spam filter")
        .addBooleanOption(opt => opt.setName("enabled").setDescription("Enable spam filter"))
        .addIntegerOption(opt => opt.setName("messages").setDescription("Message limit (default: 5)").setMinValue(3).setMaxValue(20))
        .addIntegerOption(opt => opt.setName("seconds").setDescription("Time window in seconds (default: 5)").setMinValue(2).setMaxValue(30))
        .addStringOption(opt =>
          opt
            .setName("action")
            .setDescription("Action to take")
            .addChoices(
              { name: "Delete", value: "delete" },
              { name: "Timeout", value: "timeout" },
              { name: "Kick", value: "kick" },
              { name: "Ban", value: "ban" }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("caps")
        .setDescription("Configure caps filter")
        .addBooleanOption(opt => opt.setName("enabled").setDescription("Enable caps filter"))
        .addIntegerOption(opt => opt.setName("percentage").setDescription("Caps percentage threshold (default: 70)").setMinValue(50).setMaxValue(100))
        .addStringOption(opt =>
          opt
            .setName("action")
            .setDescription("Action to take")
            .addChoices(
              { name: "Delete", value: "delete" },
              { name: "Timeout", value: "timeout" }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("links")
        .setDescription("Configure link filter")
        .addBooleanOption(opt => opt.setName("enabled").setDescription("Enable link filter"))
        .addBooleanOption(opt => opt.setName("block_invites").setDescription("Block Discord invites"))
        .addStringOption(opt =>
          opt
            .setName("action")
            .setDescription("Action to take")
            .addChoices(
              { name: "Delete", value: "delete" },
              { name: "Timeout", value: "timeout" }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("badwords")
        .setDescription("Manage bad words list")
        .addStringOption(opt => opt.setName("word").setDescription("Word to add/remove").setRequired(true))
        .addBooleanOption(opt => opt.setName("remove").setDescription("Remove word instead of adding"))
    )
    .addSubcommand(sub =>
      sub
        .setName("whitelist")
        .setDescription("Manage whitelisted domains")
        .addStringOption(opt => opt.setName("domain").setDescription("Domain to add/remove (e.g., youtube.com)").setRequired(true))
        .addBooleanOption(opt => opt.setName("remove").setDescription("Remove domain instead of adding"))
    )
    .addSubcommand(sub =>
      sub
        .setName("logchannel")
        .setDescription("Set auto-mod log channel")
        .addChannelOption(opt => opt.setName("channel").setDescription("Log channel").setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName("immune")
        .setDescription("Manage roles immune to all auto-moderation")
        .addRoleOption(opt => opt.setName("role").setDescription("Role to add/remove").setRequired(true))
        .addBooleanOption(opt => opt.setName("remove").setDescription("Remove role instead of adding"))
    )
    .addSubcommand(sub =>
      sub
        .setName("status")
        .setDescription("View auto-moderation configuration")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("strikes")
    .setDescription("Check a user's automod strike count")
    .addUserOption(opt => opt.setName("user").setDescription("User to check (leave empty for yourself)"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("removestrikes")
    .setDescription("Remove automod strikes from a user")
    .addUserOption(opt => opt.setName("user").setDescription("User to remove strikes from").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("clearallstrikes")
    .setDescription("Remove ALL strikes from ALL users (use with caution!)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View detailed information about a user")
    .addUserOption(opt => opt.setName("user").setDescription("User to view (leave empty for yourself)")),

  // ============== TICKET ENHANCEMENTS ==============
  new SlashCommandBuilder()
    .setName("ticketpriority")
    .setDescription("Set ticket priority")
    .addStringOption(opt =>
      opt
        .setName("priority")
        .setDescription("Priority level")
        .setRequired(true)
        .addChoices(
          { name: "🟢 Low", value: "low" },
          { name: "🟡 Medium", value: "medium" },
          { name: "🟠 High", value: "high" },
          { name: "🔴 Urgent", value: "urgent" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("ticketnote")
    .setDescription("Add a staff note to the ticket")
    .addStringOption(opt => opt.setName("note").setDescription("Note content").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("ticketnotes")
    .setDescription("View all notes on this ticket")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("ticketstats")
    .setDescription("View ticket system statistics")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("ticketautoclose")
    .setDescription("Configure auto-close for inactive tickets")
    .addBooleanOption(opt => opt.setName("enabled").setDescription("Enable auto-close").setRequired(true))
    .addIntegerOption(opt => opt.setName("hours").setDescription("Hours of inactivity before auto-close (default: 48)").setMinValue(12).setMaxValue(168))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("ticketrename")
    .setDescription("Rename the current ticket channel")
    .addStringOption(opt => opt.setName("name").setDescription("New name for the ticket (e.g., billing-issue)").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("setratingschannel")
    .setDescription("Set the channel for ticket ratings and feedback")
    .addChannelOption(opt => opt.setName("channel").setDescription("Ratings channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("ticketadd")
    .setDescription("Add a user to the current ticket")
    .addUserOption(opt => opt.setName("user").setDescription("User to add to the ticket").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("ticketremove")
    .setDescription("Remove a user from the current ticket")
    .addUserOption(opt => opt.setName("user").setDescription("User to remove from the ticket").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("ticketparticipants")
    .setDescription("View all participants in the current ticket")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  // ============== GIVEAWAYS ==============
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Manage giveaways")
    .addSubcommand(sub =>
      sub
        .setName("start")
        .setDescription("Start a new giveaway")
        .addStringOption(opt => opt.setName("prize").setDescription("Giveaway prize").setRequired(true))
        .addIntegerOption(opt => opt.setName("duration").setDescription("Duration in minutes (1-10080)").setRequired(true).setMinValue(1).setMaxValue(10080))
        .addIntegerOption(opt => opt.setName("winners").setDescription("Number of winners (1-20, default: 1)").setMinValue(1).setMaxValue(20))
        .addStringOption(opt => opt.setName("description").setDescription("Additional description"))
        .addStringOption(opt => opt.setName("image").setDescription("Image URL for the giveaway"))
    )
    .addSubcommand(sub =>
      sub
        .setName("end")
        .setDescription("End a giveaway early")
        .addStringOption(opt => opt.setName("message_id").setDescription("Giveaway message ID").setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName("reroll")
        .setDescription("Reroll giveaway winners")
        .addStringOption(opt => opt.setName("message_id").setDescription("Giveaway message ID").setRequired(true))
        .addIntegerOption(opt => opt.setName("winners").setDescription("Number of new winners (default: 1)").setMinValue(1).setMaxValue(20))
    )
    .addSubcommand(sub =>
      sub
        .setName("list")
        .setDescription("List all giveaways in the server")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  // ============== HELP ==============
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all available commands and features"),

  // ============== DISCORD VERIFY ==============
  new SlashCommandBuilder()
    .setName("verifyembed")
    .setDescription("Post the Discord verification embed in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("verifylog")
    .setDescription("Configure verification logging")
    .addSubcommand(sub =>
      sub
        .setName("set")
        .setDescription("Set the verification log channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel for verification logs")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ============== POLL SYSTEM ==============
  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll")
    .addStringOption((opt) => opt.setName("question").setDescription("Poll question").setRequired(true))
    .addStringOption((opt) => opt.setName("option1").setDescription("Option 1").setRequired(true))
    .addStringOption((opt) => opt.setName("option2").setDescription("Option 2").setRequired(true))
    .addStringOption((opt) => opt.setName("option3").setDescription("Option 3"))
    .addStringOption((opt) => opt.setName("option4").setDescription("Option 4"))
    .addStringOption((opt) => opt.setName("option5").setDescription("Option 5"))
    .addIntegerOption((opt) =>
      opt
        .setName("duration")
        .setDescription("Duration in minutes (default: 60)")
        .setMinValue(1)
        .setMaxValue(10080)
    ),

  // ============== WELCOME/LEAVE MESSAGES ==============
  new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Set welcome message channel and content")
    .addChannelOption((opt) => opt.setName("channel").setDescription("Welcome channel").setRequired(true))
    .addStringOption((opt) =>
      opt.setName("message").setDescription("Message (use {user} for mention, {server} for server name)")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setleave")
    .setDescription("Set leave message channel and content")
    .addChannelOption((opt) => opt.setName("channel").setDescription("Leave channel").setRequired(true))
    .addStringOption((opt) =>
      opt.setName("message").setDescription("Message (use {user} for username, {server} for server name)")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("disablewelcome")
    .setDescription("Disable welcome messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("disableleave")
    .setDescription("Disable leave messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ============== AUDIT LOGGING ==============
  new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Set the audit log channel")
    .addChannelOption((opt) => opt.setName("channel").setDescription("Log channel").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("disablelogs")
    .setDescription("Disable audit logging")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

].map((c) => c.toJSON());

module.exports = commands;
