# Contribute to lore-web

lore-web is a community addition to Lore. Contributions are welcome — please follow these guidelines.

## Developer Certificate of Origin

All commits must include a DCO (Developer Certificate of Origin) sign-off. This certifies that you wrote the code or have the right to contribute it.

Add the sign-off to every commit using the `-s` flag:

```sh
git commit -s -m "your commit message"
```

This appends a line like:

```
Signed-off-by: Your Name <your.email@example.com>
```

## Code and documentation standards

lore-web follows the Lore project's standards. See the [Lore coding and documentation guide](https://epicgames.github.io/lore/) for:

- Code style and JSDoc requirements
- Documentation format (Diataxis)
- Error handling and logging practices
- Testing expectations

## How to contribute

1. Clone this repository
2. Create a feature branch: `git checkout -b your-feature`
3. Make your changes
4. Run `npm test` to verify tests pass
5. Commit with sign-off: `git commit -s -m "describe your change"`
6. Push your branch and open a pull request

## Testing

Run the full test suite:

```sh
npm test
```

Test the SDK against a real repository:

```sh
npm run smoke -- "D:\path\to\repo"
```

Test the app manually:

```sh
npm start
```

## Reporting issues

If you find a bug or have a feature request, open an issue on GitHub with:

- A clear description of the problem or feature
- Steps to reproduce (for bugs)
- Expected and actual behavior
- Your environment (OS, Node.js version, Lore version)
