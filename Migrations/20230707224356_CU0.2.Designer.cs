﻿// <auto-generated />
using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SchedulingAssistant.Entities;

#nullable disable

namespace SchedulingAssistant.Migrations
{
    [DbContext(typeof(DBEntities))]
    [Migration("20230707224356_CU0.2")]
    partial class CU02
    {
        /// <inheritdoc />
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("ProductVersion", "7.0.8")
                .HasAnnotation("Relational:MaxIdentifierLength", 64);

            modelBuilder.Entity("SchedulingAssistant.Entities.Attendence", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<int>("ScheduleId")
                        .HasColumnType("int");

                    b.Property<string>("Status")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<ulong>("UserId")
                        .HasColumnType("bigint unsigned");

                    b.HasKey("Id");

                    b.HasIndex("ScheduleId");

                    b.ToTable("Attenants");
                });

            modelBuilder.Entity("SchedulingAssistant.Entities.Schedule", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    b.Property<DateTime>("EndTime")
                        .HasColumnType("datetime(6)");

                    b.Property<string>("EventDescription")
                        .HasColumnType("longtext");

                    b.Property<ulong>("EventId")
                        .HasColumnType("bigint unsigned");

                    b.Property<string>("EventTitle")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<bool>("HasEnded")
                        .HasColumnType("tinyint(1)");

                    b.Property<ulong>("HostId")
                        .HasColumnType("bigint unsigned");

                    b.Property<string>("HostName")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("HostURL")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("ImageURL")
                        .HasColumnType("longtext");

                    b.Property<bool>("IsActive")
                        .HasColumnType("tinyint(1)");

                    b.Property<ulong?>("RoleId")
                        .HasColumnType("bigint unsigned");

                    b.Property<ulong>("ServerId")
                        .HasColumnType("bigint unsigned");

                    b.Property<DateTime>("StartTime")
                        .HasColumnType("datetime(6)");

                    b.Property<ulong?>("ThreadId")
                        .HasColumnType("bigint unsigned");

                    b.Property<string>("TimeZone")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("WorldLink")
                        .HasColumnType("longtext");

                    b.HasKey("Id");

                    b.ToTable("Schedules");
                });

            modelBuilder.Entity("SchedulingAssistant.Entities.ServerSetting", b =>
                {
                    b.Property<long>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("bigint");

                    b.Property<ulong?>("ChannelId")
                        .HasColumnType("bigint unsigned");

                    b.Property<bool>("IsBanned")
                        .HasColumnType("tinyint(1)");

                    b.Property<ulong>("ServerId")
                        .HasColumnType("bigint unsigned");

                    b.Property<ulong?>("ThreadId")
                        .HasColumnType("bigint unsigned");

                    b.HasKey("Id");

                    b.ToTable("ServerSettings");
                });

            modelBuilder.Entity("SchedulingAssistant.Entities.Attendence", b =>
                {
                    b.HasOne("SchedulingAssistant.Entities.Schedule", null)
                        .WithMany("Attendees")
                        .HasForeignKey("ScheduleId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("SchedulingAssistant.Entities.Schedule", b =>
                {
                    b.Navigation("Attendees");
                });
#pragma warning restore 612, 618
        }
    }
}