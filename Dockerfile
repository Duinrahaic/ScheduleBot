#See https://aka.ms/containerfastmode to understand how Visual Studio uses this Dockerfile to build your images for faster debugging.

FROM mcr.microsoft.com/dotnet/runtime:7.0 AS base
WORKDIR /app

ENV DISCORD_BOT_TOKEN="MTA3MDgzNDA5NTMzNDExNzQyNw.GVE5rw.tk-nbQUPHOUBsZJ2xFktm8LybhIQHIJ59i63tA"\
	DISCORD_BOT_DB_TYPE="MySQL"\
	DISCORD_BOT_CONNECTION_STRING="Server=lin-14747-8728-mysql-primary.servers.linodedb.net;Database=Scheduling;Uid=linroot;Pwd=FoVLct2rmC44B-WX;SslMode=Preferred;"

FROM mcr.microsoft.com/dotnet/sdk:7.0 AS build
WORKDIR /src
COPY ["Schedulingassistant.csproj", "."]
RUN dotnet restore "./Schedulingassistant.csproj"
COPY . .
WORKDIR "/src/."
RUN dotnet build "Schedulingassistant.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Schedulingassistant.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Schedulingassistant.dll"]