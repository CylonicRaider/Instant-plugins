
JAVACFLAGS = -Xlint:all -Xlint:-serial -Werror

PLUGIN_NAMES = $(patsubst src/%,%,$(wildcard src/*))
PLUGIN_ARCHIVES = $(patsubst %,out/%.jar,$(PLUGIN_NAMES))

.PHONY: all clean

.SECONDARY:
.DELETE_ON_ERROR:
.SECONDEXPANSION:

all: $(PLUGIN_ARCHIVES)

clean:
	rm -rf build/ out/

build out:
	mkdir $@

build/%.jar: $$(shell find src/$$* -name '*.java' 2>/dev/null) | build
	cd src/$* && javac $(JAVACFLAGS) $$(find . -name '*.java')
	cd src/$* && jar cf ../../build/$*.jar $$(find . -name '*.class')

out/%.jar: build/%.jar $$(shell find src/$$* lib/$$* -type f 2>/dev/null) \
	| out
	cp build/$*.jar out/$*.jar
	cd src/$* && jar uf ../../out/$*.jar $$(find . -type f -not -path \
	'./META-INF/MANIFEST.MF')
	[ -d lib/$* ] && cd lib/$* && jar uf ../../out/$*.jar $$(find . \
	-type f -not -path './META-INF/MANIFEST.MF') || true
	cd src/$* && [ -f META-INF/MANIFEST.MF ] && \
	jar ufm ../../out/$*.jar META-INF/MANIFEST.MF || true
