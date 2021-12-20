import { key } from "./secrets";
import { SmartThingsClient, BearerTokenAuthenticator } from "@smartthings/core-sdk";
import * as fs from "fs";

type Reading = {
  value: number;
  timestamp: Date;
  unit: string | undefined;
};

type ReadingResponse = {
  value: number;
  timestamp: string;
  unit: string | undefined;
};

function hasKey<K extends string, T extends object>(k: K, o: T): o is T & Record<K, unknown> {
  return k in o;
}

function isObjectWithKey<T, K extends string>(o: T, k: K): o is T & object & Record<K, unknown> {
  return typeof o === "object" && o !== null && k in o;
}

function readingResponseToReading(readingResponse: ReadingResponse): Reading {
  return {
    value: readingResponse.value,
    unit: readingResponse.unit,
    timestamp: new Date(readingResponse.timestamp),
  };
}

const client = new SmartThingsClient(new BearerTokenAuthenticator(key));

// Door Light: 44428756-d11e-403c-8fb1-1ce6d447a8a8  components?.main.switch.value

try {
  fs.writeFileSync("./temperature.json", "[]", { flag: "wx" });
} catch {}
try {
  fs.writeFileSync("./humidity.json", "[]", { flag: "wx" });
} catch {}
try {
  fs.writeFileSync("./outside-temperature.json", "[]", { flag: "wx" });
} catch {}

const temperatureJson = fs.readFileSync("./temperature.json", { encoding: "utf-8" });
const humidityJson = fs.readFileSync("./humidity.json", { encoding: "utf-8" });
const outsideTemperatureJson = fs.readFileSync("./outside-temperature.json", { encoding: "utf-8" });

const reviver = function (this: any, key: string, value: any) {
  if (key === "timestamp") return new Date(value) ?? value;
  return value;
};

let temperatures: Reading[] = JSON.parse(temperatureJson, reviver);
let humiditys: Reading[] = JSON.parse(humidityJson, reviver);
let outsideTemperatures: Reading[] = JSON.parse(outsideTemperatureJson, reviver);

function isReadingResponse(o: unknown): o is ReadingResponse {
  return (
    typeof o === "object" &&
    o !== null &&
    hasKey("value", o) &&
    typeof o.value === "number" &&
    hasKey("timestamp", o) &&
    typeof o.timestamp === "string"
  );
}

async function getSensorData(): Promise<{ temperature: Reading; humidity: Reading }> {
  const result = await client.devices.getStatus("cd84f07d-84e1-48a0-968a-b2e59711230b");
  if (
    isObjectWithKey(result.components, "main") &&
    isObjectWithKey(result.components.main, "temperatureMeasurement") &&
    isObjectWithKey(result.components.main.temperatureMeasurement, "temperature") &&
    isReadingResponse(result.components.main.temperatureMeasurement.temperature) &&
    hasKey("relativeHumidityMeasurement", result.components.main) &&
    isObjectWithKey(result.components.main.relativeHumidityMeasurement, "humidity") &&
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

async function getMotionSensorData(): Promise<{ temperature: Reading }> {
  const result = await client.devices.getStatus("8c0ca3de-4735-4a70-9fa6-97382341b5cd");
  if (
    isObjectWithKey(result.components, "main") &&
    isObjectWithKey(result.components.main, "temperatureMeasurement") &&
    isObjectWithKey(result.components.main.temperatureMeasurement, "temperature") &&
    isReadingResponse(result.components.main.temperatureMeasurement.temperature)
  ) {
    const temperature = result.components.main.temperatureMeasurement.temperature;
    return {
      temperature: readingResponseToReading(temperature),
    };
  }
  throw Error("Did not get expected value");
}

function addAndWriteReading(readings: Reading[], newReading: Reading, fileName: string): Reading[] {
  const newReadings = [...readings];

  if (newReadings[newReadings.length - 1]?.timestamp.getTime() !== newReading.timestamp.getTime()) {
    newReadings.push(newReading);
    fs.writeFileSync(fileName, JSON.stringify(newReadings));
  }
  return newReadings;
}

async function getDataAndWrite() {
  getSensorData()
    .then((result) => {
      console.log("Got temperature data");
      humiditys = addAndWriteReading(humiditys, result.humidity, "./humidity.json");
      temperatures = addAndWriteReading(temperatures, result.temperature, "./temperature.json");
    })
    .catch((error) => {
      console.log("Issue getting temperature data");
    });

  getMotionSensorData()
    .then((result) => {
      console.log("Got outside temperature data");
      outsideTemperatures = addAndWriteReading(outsideTemperatures, result.temperature, "./outside-temperature.json");
    })
    .catch((error) => {
      console.log("Issue getting outside temperature data");
    });
}

getDataAndWrite();

// 5 Minutes
setInterval(() => {
  getDataAndWrite();
}, 5000 * 60);
