// backend/src/utils/analyzeSentiment.test.js
import test from "node:test";
import assert from "node:assert/strict";
import analyzeSentiment from "./analyzeSentiment.js";

function expectResult(input, expected) {
  const result = analyzeSentiment(input);

  assert.equal(result.label, expected.label, `Expected label ${expected.label}, got ${result.label}`);
  assert.equal(result.score, expected.score, `Expected score ${expected.score}, got ${result.score}`);
}

test("clear positive text stays strongly positive", () => {
  expectResult(
    {
      title: "Amazing view over the city",
      content:
        "Beautiful place, very clean, peaceful and absolutely worth it. I would recommend it."
    },
    {
      label: "positive",
      score: 8.87
    }
  );
});

test("fine neutral text stays neutral in the upper neutral band", () => {
  expectResult(
    {
      title: "Nice place for a short stop",
      content: "It was okay, clean enough, a bit crowded, nothing special but decent overall."
    },
    {
      label: "neutral",
      score: 5.56
    }
  );
});

test("clear negative text stays strongly negative", () => {
  expectResult(
    {
      title: "Disappointing visit",
      content: "Too crowded, overpriced, dirty and not worth it. I would not recommend it."
    },
    {
      label: "negative",
      score: 0.24
    }
  );
});

test("negation case 'not bad' stays slightly above neutral center", () => {
  expectResult(
    {
      content: "not bad"
    },
    {
      label: "neutral",
      score: 5.21
    }
  );
});

test("contrast case does not drift into positive", () => {
  expectResult(
    {
      content: "beautiful but too noisy and overpriced"
    },
    {
      label: "neutral",
      score: 4.88
    }
  );
});

test("Romanian positive text stays clearly positive", () => {
  expectResult(
    {
      title: "Loc superb",
      content: "Minunat, foarte curat si linistit. Merita vizitat!"
    },
    {
      label: "positive",
      score: 7.85
    }
  );
});

test("mixed-language text stays neutral when praise is offset by price", () => {
  expectResult(
    {
      content: "Amazing food, dar destul de scump"
    },
    {
      label: "neutral",
      score: 5.26
    }
  );
});

test("repetition gaming is capped and does not explode toward 10", () => {
  expectResult(
    {
      content: "amazing amazing amazing amazing amazing"
    },
    {
      label: "positive",
      score: 6.19
    }
  );
});

test("factual text with no matched signals falls back to exact neutral", () => {
  expectResult(
    {
      title: "Visited on Tuesday",
      content:
        "We arrived at 3pm and stayed for about 2 hours. The building is from the 18th century."
    },
    {
      label: "neutral",
      score: 5
    }
  );
});

test("neutral Vatican example stays neutral", () => {
  expectResult(
    {
      title: "Short visit to St. Peter’s Basilica",
      content:
        "It was interesting to see and clean enough, but a bit crowded, somewhat ordinary, and nothing special overall."
    },
    {
      label: "neutral",
      score: 4.46
    }
  );
});