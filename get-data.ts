import { SmartThingsClient, BearerTokenAuthenticator } from "@smartthings/core-sdk";
import { key } from "./secrets";
import * as fs from "fs";

const client = new SmartThingsClient(new BearerTokenAuthenticator(key));

function hasKey<K extends string, T extends object>(k: K, o: T): o is T & Record<K, unknown> {
  return k in o;
}

type Reading = {
  value: number;
  timestamp: Date;
  unit: string;
};

type ReadingResponse = {
  value: number;
  timestamp: string;
  unit: string;
};

function readingResponseToReading(readingResponse: ReadingResponse): Reading {
  return {
    value: readingResponse.value,
    unit: readingResponse.unit,
    timestamp: new Date(readingResponse.timestamp),
  };
}

try {
  fs.writeFileSync("./temperature.json", "[]", { flag: "wx" });
  fs.writeFileSync("./humidity.json", "[]", { flag: "wx" });
} catch {}

const temperatureJson = fs.readFileSync("./temperature.json", { encoding: "utf-8" });
const humidityJson = fs.readFileSync("./humidity.json", { encoding: "utf-8" });

const reviver = function (this: any, key: string, value: any) {
  if (key === "timestamp") return new Date(value) ?? value;
  return value;
};

const temperatures: [Reading] = JSON.parse(temperatureJson, reviver);
const humiditys: [Reading] = JSON.parse(humidityJson, reviver);

function isReadingResponse(o: unknown): o is ReadingResponse {
  return (
    typeof o === "object" &&
    o !== null &&
    hasKey("value", o) &&
    typeof o.value === "number" &&
    hasKey("unit", o) &&
    typeof o.unit === "string" &&
    hasKey("timestamp", o) &&
    typeof o.timestamp === "string"
  );
}

async function getData(): Promise<{ temperature: Reading; humidity: Reading }> {
  const result = await client.devices.getStatus("cd84f07d-84e1-48a0-968a-b2e59711230b");

  if (
    typeof result.components === "object" &&
    result.components !== null &&
    hasKey("main", result.components) &&
    typeof result.components.main === "object" &&
    result.components.main !== null &&
    hasKey("temperatureMeasurement", result.components.main) &&
    typeof result.components.main.temperatureMeasurement === "object" &&
    result.components.main.temperatureMeasurement !== null &&
    hasKey("temperature", result.components.main.temperatureMeasurement) &&
    isReadingResponse(result.components.main.temperatureMeasurement.temperature) &&
    hasKey("relativeHumidityMeasurement", result.components.main) &&
    typeof result.components.main.relativeHumidityMeasurement === "object" &&
    result.components.main.relativeHumidityMeasurement !== null &&
    hasKey("humidity", result.components.main.relativeHumidityMeasurement) &&
    isReadingResponse(result.components.main.relativeHumidityMeasurement.humidity)
  ) {
    const temperature = result.components.main.temperatureMeasurement.temperature;
    const humidity = result.components.main.relativeHumidityMeasurement.humidity;
    return {
      temperature: readingResponseToReading(temperature),
      humidity: readingResponseToReading(humidity),
    };
  }
  throw Error("Did not get expected value");
}

async function getDataAndWrite() {
  getData()
    .then((result) => {
      console.log("Got data");
      const humidity = result.humidity;
      const temperature = result.temperature;
      if (humiditys[0]?.timestamp.getTime() !== humidity.timestamp.getTime()) {
        humiditys.push(humidity);
        fs.writeFileSync("./humidity.json", JSON.stringify(humiditys));
      }

      if (temperatures[0]?.timestamp.getTime() !== temperature.timestamp.getTime()) {
        temperatures.push(temperature);
        fs.writeFileSync("./temperature.json", JSON.stringify(temperatures));
      }
    })
    .catch((error) => {
      console.log("Issue getting data");
    });
}

getDataAndWrite();

// 5 Minutes
setInterval(() => {
  getDataAndWrite();
}, 5000 * 60);
